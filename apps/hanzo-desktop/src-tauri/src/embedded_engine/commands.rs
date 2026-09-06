//! Tauri IPC commands for the embedded Hanzo Engine.
//!
//! These drive the SAME [`EmbeddedEngine`] orchestrator as the `/v1/engine/*`
//! HTTP routes -- there is exactly one model-load path. Unlike the HTTP
//! handlers, IPC commands run off the axum server, so loading/unloading (which
//! rebinds the canonical listener) can be awaited inline without deadlocking on
//! the server's graceful shutdown.
//!
//! Inference is NOT exposed over IPC: chat / responses / messages / embeddings
//! are served by the canonical `hanzo-server-core` router over HTTP on
//! `127.0.0.1:36900`, identical to `hanzo serve`. The previous `engine_chat`
//! and `engine_stream_chat` IPC commands (a parallel inference path) are gone.

use std::sync::Arc;

use tauri::State;
use tokio::sync::RwLock;

use super::engine::EmbeddedEngine;
use super::types::*;

/// Managed state for the embedded engine.
pub type EmbeddedEngineState = Arc<RwLock<EmbeddedEngine>>;

/// Get engine status (loaded model, device, ...).
#[tauri::command]
pub async fn engine_get_status(
    state: State<'_, EmbeddedEngineState>,
) -> Result<EngineStatus, String> {
    let engine = state.read().await;
    Ok(engine.get_status().await)
}

/// Load a GGUF model into the engine (builds canonical state + starts server).
#[tauri::command]
pub async fn engine_load_gguf(
    state: State<'_, EmbeddedEngineState>,
    options: LoadModelOptions,
) -> Result<(), String> {
    let mut engine = state.write().await;
    engine
        .load_gguf_model(options)
        .await
        .map_err(|e| e.to_string())
}

/// Load a model (format auto-detected from the id; GGUF vs safetensors/auto).
#[tauri::command]
pub async fn engine_load_model(
    state: State<'_, EmbeddedEngineState>,
    options: LoadModelOptions,
) -> Result<(), String> {
    let mut engine = state.write().await;
    engine.load_model(options).await.map_err(|e| e.to_string())
}

/// Unload the current model (stops the canonical server).
#[tauri::command]
pub async fn engine_unload_model(
    state: State<'_, EmbeddedEngineState>,
) -> Result<(), String> {
    let mut engine = state.write().await;
    engine.unload_model().await.map_err(|e| e.to_string())
}

/// Whether a model is currently loaded.
#[tauri::command]
pub async fn engine_is_model_loaded(
    state: State<'_, EmbeddedEngineState>,
) -> Result<bool, String> {
    let engine = state.read().await;
    Ok(engine.is_model_loaded())
}

/// The currently loaded model id, if any.
#[tauri::command]
pub async fn engine_get_model_id(
    state: State<'_, EmbeddedEngineState>,
) -> Result<Option<String>, String> {
    let engine = state.read().await;
    Ok(engine.get_model_id().map(|s| s.to_string()))
}

/// Register all embedded-engine IPC command handlers.
#[macro_export]
macro_rules! embedded_engine_commands {
    () => {
        engine_get_status,
        engine_load_gguf,
        engine_load_model,
        engine_unload_model,
        engine_is_model_loaded,
        engine_get_model_id,
    };
}
