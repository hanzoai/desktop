//! Startup wiring for the embedded engine.
//!
//! When `HANZO_EMBEDDED_ENGINE` is enabled, the desktop runs inference
//! IN-PROCESS instead of spawning external `mistralrs-server` children:
//!
//! - Chat model (`Qwen/Qwen3-0.6B` by default) on :36900, OpenAI surface under
//!   `/v1/engine/*`.
//! - Embedding model (`Qwen/Qwen3-Embedding-0.6B` by default) on :36901,
//!   serving `/v1/engine/embeddings`.
//!
//! Both servers bind immediately (so `/health` answers right away) while the
//! model loads in the background — matching the external engine's
//! non-blocking startup so node startup is never stalled on model load.

use std::sync::Arc;
use tokio::sync::RwLock;

use super::engine::{EmbeddedEngine, EngineMode};
use super::server::{EmbeddedEngineServer, DEFAULT_PORT};
use super::types::{LoadModelOptions, ModelFormat};

/// Env flag that turns the embedded (in-process) engine on. DEFAULT OFF: until
/// this is set to a truthy value the desktop keeps spawning the external
/// `mistralrs-server` processes (see `HanzoNodeManager::spawn`).
pub const EMBEDDED_ENGINE_FLAG: &str = "HANZO_EMBEDDED_ENGINE";

/// Default chat model served on :36900.
const DEFAULT_CHAT_MODEL: &str = "Qwen/Qwen3-0.6B";
/// Default embedding model served on :36901.
const DEFAULT_EMBED_MODEL: &str = "Qwen/Qwen3-Embedding-0.6B";
/// Default embedding port (chat port + 1).
const DEFAULT_EMBED_PORT: u16 = DEFAULT_PORT + 1;

/// Returns true if the embedded in-process engine is enabled via env.
/// Accepts `1`, `true`, `yes`, `on` (case-insensitive). Anything else (or
/// unset) keeps the embedded engine OFF.
pub fn is_enabled() -> bool {
    std::env::var(EMBEDDED_ENGINE_FLAG)
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            matches!(v.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(false)
}

/// Handles to the running embedded servers, retained so they can be shut down
/// cleanly on app exit. Dropping these does NOT stop the servers; call
/// [`EmbeddedEngines::shutdown`].
pub struct EmbeddedEngines {
    chat_server: EmbeddedEngineServer,
    embed_server: EmbeddedEngineServer,
}

impl EmbeddedEngines {
    /// Stop both embedded HTTP servers (graceful shutdown).
    pub async fn shutdown(&mut self) {
        let _ = self.chat_server.stop().await;
        let _ = self.embed_server.stop().await;
    }
}

/// Read `port` from `var`, falling back to `default`.
fn port_from_env(var: &str, default: u16) -> u16 {
    std::env::var(var)
        .ok()
        .and_then(|v| v.trim().parse::<u16>().ok())
        .unwrap_or(default)
}

/// Read a string from `var`, falling back to `default`.
fn string_from_env(var: &str, default: &str) -> String {
    std::env::var(var).unwrap_or_else(|_| default.to_string())
}

/// Start the embedded chat + embedding engines.
///
/// Binds both HTTP servers immediately and kicks off model loading in the
/// background. Returns handles for graceful shutdown. Honors the same
/// `HANZO_ENGINE_PORT` / `HANZO_EMBED_PORT` / `HANZO_ENGINE_MODEL` /
/// `HANZO_EMBED_MODEL` env vars as the external engine so configuration is
/// shared between the two backends.
pub async fn start() -> anyhow::Result<EmbeddedEngines> {
    let chat_port = port_from_env("HANZO_ENGINE_PORT", DEFAULT_PORT);
    let embed_port = port_from_env("HANZO_EMBED_PORT", DEFAULT_EMBED_PORT);
    let chat_model = string_from_env("HANZO_ENGINE_MODEL", DEFAULT_CHAT_MODEL);
    let embed_model = string_from_env("HANZO_EMBED_MODEL", DEFAULT_EMBED_MODEL);

    // --- Chat engine on :chat_port ---
    let chat_engine = Arc::new(RwLock::new(EmbeddedEngine::with_mode(EngineMode::Chat)));
    let mut chat_server = EmbeddedEngineServer::new(chat_engine.clone())
        .with_port(chat_port)
        .with_served_model_name(chat_model.clone());
    chat_server.start().await?;

    {
        let engine = chat_engine.clone();
        let model_id = chat_model.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("embedded engine: loading chat model `{}` in background", model_id);
            let opts = LoadModelOptions {
                model_id: model_id.clone(),
                format: ModelFormat::Auto,
                ..Default::default()
            };
            let mut guard = engine.write().await;
            if let Err(e) = guard.load_model(opts).await {
                log::error!("embedded engine: failed to load chat model `{}`: {}", model_id, e);
            } else {
                log::info!("embedded engine: chat model `{}` ready", model_id);
            }
        });
    }

    // --- Embedding engine on :embed_port ---
    let embed_engine = Arc::new(RwLock::new(EmbeddedEngine::with_mode(EngineMode::Embedding)));
    let mut embed_server = EmbeddedEngineServer::new(embed_engine.clone())
        .with_port(embed_port)
        .with_served_model_name(embed_model.clone());
    embed_server.start().await?;

    {
        let engine = embed_engine.clone();
        let model_id = embed_model.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("embedded engine: loading embedding model `{}` in background", model_id);
            let opts = LoadModelOptions {
                model_id: model_id.clone(),
                // Embeddings: keep full precision for retrieval quality.
                use_isq: Some(false),
                ..Default::default()
            };
            let mut guard = engine.write().await;
            if let Err(e) = guard.load_embedding_model(opts).await {
                log::error!("embedded engine: failed to load embedding model `{}`: {}", model_id, e);
            } else {
                log::info!("embedded engine: embedding model `{}` ready", model_id);
            }
        });
    }

    log::info!(
        "embedded engine started: chat on :{} (model {}), embeddings on :{} (model {})",
        chat_port, chat_model, embed_port, embed_model
    );

    Ok(EmbeddedEngines { chat_server, embed_server })
}
