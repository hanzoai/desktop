//! OpenAI-compatible HTTP server for the embedded Hanzo Engine
//!
//! This exposes the same API as Ollama, LM Studio, and OpenAI,
//! allowing the frontend to use the same code path for all engines.

use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::Result;

use super::engine::EmbeddedEngine;

/// Default port for the embedded engine server
pub const DEFAULT_PORT: u16 = 36900;

/// The embedded engine HTTP server
pub struct EmbeddedEngineServer {
    engine: Arc<RwLock<EmbeddedEngine>>,
    port: u16,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl EmbeddedEngineServer {
    /// Create a new server instance
    pub fn new(engine: Arc<RwLock<EmbeddedEngine>>) -> Self {
        Self {
            engine,
            port: DEFAULT_PORT,
            shutdown_tx: None,
        }
    }

    /// Set the port to listen on
    pub fn with_port(mut self, port: u16) -> Self {
        self.port = port;
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
            extract::State,
            response::{Json, sse::{Event, Sse}},
            http::StatusCode,
        };
        use futures_util::stream::Stream;
        use std::convert::Infallible;

        let engine = self.engine.clone();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        self.shutdown_tx = Some(shutdown_tx);

        // Build router with OpenAI-compatible endpoints
        let app = Router::new()
            // Health check
            .route("/health", get(|| async { "ok" }))
            // OpenAI-compatible endpoints
            .route("/v1/models", get(list_models))
            .route("/v1/chat/completions", post(chat_completions))
            .route("/v1/embeddings", post(embeddings))
            // Engine management (Hanzo-specific)
            .route("/v1/engine/status", get(engine_status))
            .route("/v1/engine/load", post(load_model))
            .route("/v1/engine/unload", post(unload_model))
            .with_state(engine);

        let addr = format!("127.0.0.1:{}", self.port);
        log::info!("Starting Hanzo Engine server on {}", addr);

        // Spawn server in background
        let listener = tokio::net::TcpListener::bind(&addr).await?;
        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .unwrap_or_else(|e| log::error!("Server error: {}", e));
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
    response::Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};

type EngineState = Arc<RwLock<EmbeddedEngine>>;

/// GET /v1/models - List available models
async fn list_models(
    State(engine): State<EngineState>,
) -> Json<ModelsResponse> {
    let engine = engine.read().await;
    let model_id = engine.get_model_id().map(|s| s.to_string());

    Json(ModelsResponse {
        object: "list".to_string(),
        data: model_id.map(|id| vec![ModelObject {
            id: id.clone(),
            object: "model".to_string(),
            created: 0,
            owned_by: "hanzo".to_string(),
        }]).unwrap_or_default(),
    })
}

/// POST /v1/chat/completions - Chat completion
async fn chat_completions(
    State(engine): State<EngineState>,
    Json(request): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, (StatusCode, String)> {
    let engine_guard = engine.read().await;

    // Convert messages
    let messages: Vec<super::types::ChatMessage> = request.messages.iter().map(|m| {
        super::types::ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        }
    }).collect();

    let options = super::types::ChatOptions {
        temperature: request.temperature,
        top_p: request.top_p,
        max_tokens: request.max_tokens,
        stop: request.stop.clone(),
        ..Default::default()
    };

    // TODO: Handle streaming (request.stream)

    match engine_guard.chat(messages, options).await {
        Ok(response) => Ok(Json(ChatCompletionResponse {
            id: response.id,
            object: "chat.completion".to_string(),
            created: chrono::Utc::now().timestamp() as u64,
            model: response.model,
            choices: response.choices.into_iter().map(|c| ChatChoice {
                index: c.index,
                message: ChatMessage {
                    role: c.message.role,
                    content: c.message.content,
                },
                finish_reason: c.finish_reason,
            }).collect(),
            usage: Usage {
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
            },
        })),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// POST /v1/embeddings - Generate embeddings
async fn embeddings(
    State(_engine): State<EngineState>,
    Json(_request): Json<EmbeddingRequest>,
) -> Result<Json<EmbeddingResponse>, (StatusCode, String)> {
    // TODO: Implement embeddings
    Err((StatusCode::NOT_IMPLEMENTED, "Embeddings not yet implemented".to_string()))
}

/// GET /v1/engine/status - Engine status (Hanzo-specific)
async fn engine_status(
    State(engine): State<EngineState>,
) -> Json<super::types::EngineStatus> {
    let engine = engine.read().await;
    Json(engine.get_status().await)
}

/// POST /v1/engine/load - Load a model (Hanzo-specific)
async fn load_model(
    State(engine): State<EngineState>,
    Json(request): Json<super::types::LoadModelOptions>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut engine = engine.write().await;

    let result = if request.model_id.ends_with(".gguf") {
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
    State(engine): State<EngineState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut engine = engine.write().await;
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
    model: String,
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
}

#[derive(Debug, Deserialize)]
struct EmbeddingRequest {
    model: String,
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
