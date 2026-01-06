//! Tauri commands for the embedded Hanzo Engine

use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;

use super::engine::EmbeddedEngine;
use super::types::*;

/// Managed state for the embedded engine
pub type EmbeddedEngineState = Arc<RwLock<EmbeddedEngine>>;

/// Get engine status
#[tauri::command]
pub async fn engine_get_status(
    state: State<'_, EmbeddedEngineState>,
) -> Result<EngineStatus, String> {
    let engine = state.read().await;
    Ok(engine.get_status().await)
}

/// Load a GGUF model into the engine
#[tauri::command]
pub async fn engine_load_gguf(
    state: State<'_, EmbeddedEngineState>,
    options: LoadModelOptions,
) -> Result<(), String> {
    let mut engine = state.write().await;
    engine.load_gguf_model(options).await.map_err(|e| e.to_string())
}

/// Load a HuggingFace model (with ISQ quantization)
#[tauri::command]
pub async fn engine_load_model(
    state: State<'_, EmbeddedEngineState>,
    options: LoadModelOptions,
) -> Result<(), String> {
    let mut engine = state.write().await;

    // Determine if it's a GGUF file based on extension
    if options.model_id.ends_with(".gguf") || options.model_id.contains("GGUF") {
        engine.load_gguf_model(options).await.map_err(|e| e.to_string())
    } else {
        engine.load_hf_model(options).await.map_err(|e| e.to_string())
    }
}

/// Unload the current model
#[tauri::command]
pub async fn engine_unload_model(
    state: State<'_, EmbeddedEngineState>,
) -> Result<(), String> {
    let mut engine = state.write().await;
    engine.unload_model().await.map_err(|e| e.to_string())
}

/// Send a chat completion request (non-streaming)
#[tauri::command]
pub async fn engine_chat(
    state: State<'_, EmbeddedEngineState>,
    messages: Vec<ChatMessage>,
    options: Option<ChatOptions>,
) -> Result<ChatCompletionResponse, String> {
    let engine = state.read().await;
    engine.chat(messages, options.unwrap_or_default()).await.map_err(|e| e.to_string())
}

/// Send a streaming chat completion request
/// Emits "engine-stream-chunk" events to the frontend
#[tauri::command]
pub async fn engine_stream_chat(
    app: AppHandle,
    state: State<'_, EmbeddedEngineState>,
    messages: Vec<ChatMessage>,
    options: Option<ChatOptions>,
) -> Result<String, String> {
    let engine = state.read().await;
    let request_id = uuid::Uuid::new_v4().to_string();
    let request_id_clone = request_id.clone();
    let app_clone = app.clone();

    // Stream chunks via Tauri events
    engine.stream_chat(messages, options.unwrap_or_default(), move |chunk| {
        if let Err(e) = app_clone.emit("engine-stream-chunk", &chunk) {
            log::error!("Failed to emit stream chunk: {}", e);
        }
    }).await.map_err(|e| e.to_string())?;

    // Emit completion event
    app.emit("engine-stream-done", &request_id_clone)
        .map_err(|e| e.to_string())?;

    Ok(request_id)
}

/// Check if a model is loaded
#[tauri::command]
pub async fn engine_is_model_loaded(
    state: State<'_, EmbeddedEngineState>,
) -> Result<bool, String> {
    let engine = state.read().await;
    Ok(engine.is_model_loaded())
}

/// Get the current model ID
#[tauri::command]
pub async fn engine_get_model_id(
    state: State<'_, EmbeddedEngineState>,
) -> Result<Option<String>, String> {
    let engine = state.read().await;
    Ok(engine.get_model_id().map(|s| s.to_string()))
}

/// Generate all command handlers for registration
#[macro_export]
macro_rules! embedded_engine_commands {
    () => {
        engine_get_status,
        engine_load_gguf,
        engine_load_model,
        engine_unload_model,
        engine_chat,
        engine_stream_chat,
        engine_is_model_loaded,
        engine_get_model_id,
    };
}
