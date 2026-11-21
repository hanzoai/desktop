//! OpenAI-compatible HTTP server for the embedded Hanzo Engine
//!
//! This exposes the same API as the external `mistralrs-server`, so the
//! frontend talks to one engine surface regardless of whether inference is
//! in-process (embedded) or out-of-process (external).
//!
//! ## API surface (canonical `/v1/engine/*` contract)
//! - `GET  /health`                     -> "ok" (liveness, at ROOT)
//! - `GET  /v1/engine/models`           -> list loaded model(s)
//! - `GET  /v1/engine/status`           -> engine status (Hanzo-specific)
//! - `POST /v1/engine/chat/completions` -> chat (streaming + non-streaming)
//! - `POST /v1/engine/embeddings`       -> embeddings
//! - `POST /v1/engine/load`             -> load a model (Hanzo-specific)
//! - `POST /v1/engine/unload`           -> unload current model (Hanzo-specific)

use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::Result;

use super::engine::EmbeddedEngine;

/// Default port for the embedded engine server (chat). Embeddings default to
/// `DEFAULT_PORT + 1` when run as a second instance.
pub const DEFAULT_PORT: u16 = 36900;

/// The embedded engine HTTP server
pub struct EmbeddedEngineServer {
    engine: Arc<RwLock<EmbeddedEngine>>,
    port: u16,
    /// Model name reported by `/v1/engine/models` and echoed in responses.
    /// The OpenAI surface lets clients send `model: "default"`, so we report a
    /// stable served name independent of the underlying repo id.
    served_model_name: Option<String>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl EmbeddedEngineServer {
    /// Create a new server instance
    pub fn new(engine: Arc<RwLock<EmbeddedEngine>>) -> Self {
        Self {
            engine,
            port: DEFAULT_PORT,
            served_model_name: None,
            shutdown_tx: None,
        }
    }

    /// Set the port to listen on
    pub fn with_port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }

    /// Set the served model name reported on the OpenAI surface.
    pub fn with_served_model_name(mut self, name: impl Into<String>) -> Self {
        self.served_model_name = Some(name.into());
        self
    }

    /// Get the base URL for the server
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Start the server in the background
    pub async fn start(&mut self) -> Result<()> {
        use axum::{
            Router,
            routing::{get, post},
        };

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        self.shutdown_tx = Some(shutdown_tx);

        let state = AppState {
            engine: self.engine.clone(),
            served_model_name: Arc::new(self.served_model_name.clone()),
        };

        // Build router. The canonical contract mounts the OpenAI surface under
        // `/v1/engine/*` with `/health` at the root.
        let app = Router::new()
            // Liveness check (ROOT) — used by detect-and-reuse health probes.
            .route("/health", get(health))
            // OpenAI-compatible surface under /v1/engine/*
            .route("/v1/engine/models", get(list_models))
            .route("/v1/engine/chat/completions", post(chat_completions))
            .route("/v1/engine/embeddings", post(embeddings))
            // Engine management (Hanzo-specific)
            .route("/v1/engine/status", get(engine_status))
            .route("/v1/engine/load", post(load_model))
            .route("/v1/engine/unload", post(unload_model))
            .with_state(state);

        let addr = format!("127.0.0.1:{}", self.port);
        log::info!("Starting embedded Hanzo Engine server on {} (/v1/engine/*)", addr);

        // Spawn server in background
        let listener = tokio::net::TcpListener::bind(&addr).await?;
        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .unwrap_or_else(|e| log::error!("Embedded engine server error: {}", e));
        });

        Ok(())
    }

    /// Stop the server
    pub async fn stop(&mut self) -> Result<()> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        Ok(())
    }

    /// Check if the server is running
    pub fn is_running(&self) -> bool {
        self.shutdown_tx.is_some()
    }

    /// Get the port
    pub fn port(&self) -> u16 {
        self.port
    }
}

// ============================================================================
// Route Handlers
// ============================================================================

use axum::{
    extract::State,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json,
    },
    http::StatusCode,
};
use futures_util::stream::{self, Stream};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;

/// Shared HTTP state: the engine plus the served model name.
#[derive(Clone)]
struct AppState {
    engine: Arc<RwLock<EmbeddedEngine>>,
    served_model_name: Arc<Option<String>>,
}

impl AppState {
    /// Resolve the model name to report: prefer the configured served name,
    /// else the loaded repo id, else "default".
    async fn resolved_model_name(&self) -> String {
        if let Some(name) = self.served_model_name.as_ref() {
            return name.clone();
        }
        let engine = self.engine.read().await;
        engine.get_model_id().map(|s| s.to_string()).unwrap_or_else(|| "default".to_string())
    }
}

/// GET /health — liveness
async fn health() -> &'static str {
    "ok"
}

/// GET /v1/engine/models - List available models
async fn list_models(State(state): State<AppState>) -> Json<ModelsResponse> {
    let engine = state.engine.read().await;
    let loaded = engine.get_model_id().map(|s| s.to_string());
    drop(engine);

    // Report the served name if configured, falling back to the loaded id.
    let id = state
        .served_model_name
        .as_ref()
        .clone()
        .or(loaded);

    Json(ModelsResponse {
        object: "list".to_string(),
        data: id
            .map(|id| {
                vec![ModelObject {
                    id,
                    object: "model".to_string(),
                    created: 0,
                    owned_by: "hanzo".to_string(),
                }]
            })
            .unwrap_or_default(),
    })
}

/// POST /v1/engine/chat/completions - Chat completion (streaming + non-streaming)
async fn chat_completions(
    State(state): State<AppState>,
    Json(request): Json<ChatCompletionRequest>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let messages: Vec<super::types::ChatMessage> = request
        .messages
        .iter()
        .map(|m| super::types::ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    let options = super::types::ChatOptions {
        temperature: request.temperature,
        top_p: request.top_p,
        max_tokens: request.max_tokens,
        stop: request.stop.clone(),
        ..Default::default()
    };

    let model_name = state.resolved_model_name().await;

    if request.stream.unwrap_or(false) {
        // Streaming: emit OpenAI-style SSE `data: {chunk}\n\n` frames followed
        // by a terminal `data: [DONE]`. The frontend stream parser expects
        // `choices[0].delta.content`.
        Ok(chat_completions_stream(state, messages, options, model_name).await.into_response())
    } else {
        let engine = state.engine.read().await;
        match engine.chat(messages, options).await {
            Ok(response) => Ok(Json(ChatCompletionResponse {
                id: response.id,
                object: "chat.completion".to_string(),
                created: chrono::Utc::now().timestamp() as u64,
                model: model_name,
                choices: response
                    .choices
                    .into_iter()
                    .map(|c| ChatChoice {
                        index: c.index,
                        message: ChatMessage {
                            role: c.message.role,
                            content: c.message.content,
                        },
                        finish_reason: c.finish_reason,
                    })
                    .collect(),
                usage: Usage {
                    prompt_tokens: response.usage.prompt_tokens,
                    completion_tokens: response.usage.completion_tokens,
                    total_tokens: response.usage.total_tokens,
                    avg_prompt_tok_per_sec: response.usage.prompt_tokens_per_sec,
                    avg_compl_tok_per_sec: response.usage.completion_tokens_per_sec,
                },
            })
            .into_response()),
            Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
        }
    }
}

/// Build the SSE stream for a streaming chat completion.
///
/// We buffer the model's deltas into a channel and re-emit them as
/// OpenAI-compatible chunk frames. The engine holds a read lock for the
/// duration of generation (single in-process model, serialized by the lock).
async fn chat_completions_stream(
    state: AppState,
    messages: Vec<super::types::ChatMessage>,
    options: super::types::ChatOptions,
    model_name: String,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<ChatCompletionChunk>();
    let id = format!("chatcmpl-{}", uuid::Uuid::new_v4());

    let id_for_task = id.clone();
    let model_for_task = model_name.clone();
    tokio::spawn(async move {
        let engine = state.engine.read().await;
        let created = chrono::Utc::now().timestamp() as u64;
        let result = engine
            .stream_chat(messages, options, |chunk| {
                let frame = ChatCompletionChunk {
                    id: id_for_task.clone(),
                    object: "chat.completion.chunk".to_string(),
                    created,
                    model: model_for_task.clone(),
                    choices: vec![ChatChoiceDelta {
                        index: 0,
                        delta: ChatDelta {
                            role: None,
                            content: Some(chunk.delta),
                        },
                        finish_reason: chunk.finish_reason,
                    }],
                };
                let _ = tx.send(frame);
            })
            .await;
        if let Err(e) = result {
            log::error!("embedded engine stream error: {}", e);
        }
        // Channel drop signals end-of-stream to the SSE adapter below.
    });

    // State machine: stream model chunks, then emit a single `[DONE]`, then end.
    let body = stream::unfold(SseState::Streaming(rx), |state| async move {
        match state {
            SseState::Streaming(mut rx) => match rx.recv().await {
                Some(chunk) => {
                    let json = serde_json::to_string(&chunk).unwrap_or_else(|_| "{}".to_string());
                    Some((Ok(Event::default().data(json)), SseState::Streaming(rx)))
                }
                None => Some((Ok(Event::default().data("[DONE]")), SseState::Done)),
            },
            SseState::Done => None,
        }
    });

    Sse::new(body).keep_alive(KeepAlive::default())
}

/// Drives the chat SSE stream: forward model chunks until the channel closes,
/// then emit one terminal `[DONE]` frame and stop.
enum SseState {
    Streaming(tokio::sync::mpsc::UnboundedReceiver<ChatCompletionChunk>),
    Done,
}

/// POST /v1/engine/embeddings - Generate embeddings
async fn embeddings(
    State(state): State<AppState>,
    Json(request): Json<EmbeddingRequest>,
) -> Result<Json<EmbeddingResponse>, (StatusCode, String)> {
    let inputs: Vec<String> = match request.input {
        EmbeddingInput::Single(s) => vec![s],
        EmbeddingInput::Multiple(v) => v,
    };

    let model_name = state.resolved_model_name().await;
    let engine = state.engine.read().await;

    match engine.embeddings(inputs).await {
        Ok(vectors) => {
            let data = vectors
                .into_iter()
                .enumerate()
                .map(|(index, embedding)| EmbeddingData {
                    object: "embedding".to_string(),
                    embedding,
                    index,
                })
                .collect();
            Ok(Json(EmbeddingResponse {
                object: "list".to_string(),
                data,
                model: model_name,
                usage: EmbeddingUsage {
                    prompt_tokens: 0,
                    total_tokens: 0,
                },
            }))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// GET /v1/engine/status - Engine status (Hanzo-specific)
async fn engine_status(State(state): State<AppState>) -> Json<super::types::EngineStatus> {
    let engine = state.engine.read().await;
    Json(engine.get_status().await)
}

/// POST /v1/engine/load - Load a model (Hanzo-specific)
async fn load_model(
    State(state): State<AppState>,
    Json(request): Json<super::types::LoadModelOptions>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut engine = state.engine.write().await;

    let result = if request.model_id.ends_with(".gguf") || request.model_id.contains("GGUF") {
        engine.load_gguf_model(request).await
    } else {
        engine.load_hf_model(request).await
    };

    match result {
        Ok(()) => Ok(Json(serde_json::json!({"status": "loaded"}))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// POST /v1/engine/unload - Unload the current model (Hanzo-specific)
async fn unload_model(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut engine = state.engine.write().await;
    match engine.unload_model().await {
        Ok(()) => Ok(Json(serde_json::json!({"status": "unloaded"}))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

// ============================================================================
// OpenAI API Types
// ============================================================================

#[derive(Debug, Serialize)]
struct ModelsResponse {
    object: String,
    data: Vec<ModelObject>,
}

#[derive(Debug, Serialize)]
struct ModelObject {
    id: String,
    object: String,
    created: u64,
    owned_by: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionRequest {
    #[allow(dead_code)]
    #[serde(default)]
    model: Option<String>,
    messages: Vec<ChatMessage>,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    top_p: Option<f64>,
    #[serde(default)]
    max_tokens: Option<usize>,
    #[serde(default)]
    stream: Option<bool>,
    #[serde(default)]
    stop: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<ChatChoice>,
    usage: Usage,
}

#[derive(Debug, Serialize)]
struct ChatChoice {
    index: usize,
    message: ChatMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Serialize)]
struct Usage {
    prompt_tokens: usize,
    completion_tokens: usize,
    total_tokens: usize,
    // Benchmark page reads these throughput fields if present.
    #[serde(skip_serializing_if = "Option::is_none")]
    avg_prompt_tok_per_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    avg_compl_tok_per_sec: Option<f64>,
}

// --- Streaming chunk types (OpenAI `chat.completion.chunk`) ---

#[derive(Debug, Clone, Serialize)]
struct ChatCompletionChunk {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<ChatChoiceDelta>,
}

#[derive(Debug, Clone, Serialize)]
struct ChatChoiceDelta {
    index: usize,
    delta: ChatDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ChatDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingRequest {
    #[allow(dead_code)]
    #[serde(default)]
    model: Option<String>,
    input: EmbeddingInput,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum EmbeddingInput {
    Single(String),
    Multiple(Vec<String>),
}

#[derive(Debug, Serialize)]
struct EmbeddingResponse {
    object: String,
    data: Vec<EmbeddingData>,
    model: String,
    usage: EmbeddingUsage,
}

#[derive(Debug, Serialize)]
struct EmbeddingData {
    object: String,
    embedding: Vec<f32>,
    index: usize,
}

#[derive(Debug, Serialize)]
struct EmbeddingUsage {
    prompt_tokens: usize,
    total_tokens: usize,
}
