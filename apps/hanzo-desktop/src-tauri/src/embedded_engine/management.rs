//! Thin desktop management surface under `/v1/engine/*`.
//!
//! This is NOT a second inference server. Inference (`/v1/chat/completions`,
//! `/v1/responses`, `/v1/messages`, `/v1/embeddings`, `/v1/models`, ...) is
//! served by the canonical `hanzo-server-core` router. These handlers only
//! cover the desktop's *lifecycle* contract that `client.ts` targets:
//!
//!   - `GET  /v1/engine/status`  -> is a model loaded? which device?
//!   - `GET  /v1/engine/models`  -> the loaded model (OpenAI list shape)
//!   - `POST /v1/engine/load`    -> build canonical state + (re)start server
//!   - `POST /v1/engine/unload`  -> stop server + drop state
//!
//! All four funnel through the one shared [`EmbeddedEngine`] orchestrator, so
//! HTTP and Tauri IPC drive the exact same model-load path.

use std::sync::Arc;

use axum::{
    extract::State,
    response::Json,
    routing::{get, post},
    Router,
};
use tokio::sync::RwLock;

use super::engine::EmbeddedEngine;
use super::types::{EngineStatus, LoadModelOptions};

type ManagedEngine = Arc<RwLock<EmbeddedEngine>>;

/// Build the `/v1/engine/*` management router bound to the shared engine.
pub fn router(engine: ManagedEngine) -> Router {
    Router::new()
        .route("/v1/engine/status", get(status))
        .route("/v1/engine/models", get(models))
        .route("/v1/engine/load", post(load))
        .route("/v1/engine/unload", post(unload))
        .with_state(engine)
}

async fn status(State(engine): State<ManagedEngine>) -> Json<EngineStatus> {
    Json(engine.read().await.get_status().await)
}

#[derive(serde::Serialize)]
struct ModelsResponse {
    object: &'static str,
    data: Vec<ModelObject>,
}

#[derive(serde::Serialize)]
struct ModelObject {
    id: String,
    object: &'static str,
    created: u64,
    owned_by: &'static str,
}

async fn models(State(engine): State<ManagedEngine>) -> Json<ModelsResponse> {
    let engine = engine.read().await;
    let data = engine
        .get_model_id()
        .map(|id| {
            vec![ModelObject {
                id: id.to_string(),
                object: "model",
                created: 0,
                owned_by: "hanzo",
            }]
        })
        .unwrap_or_default();
    Json(ModelsResponse {
        object: "list",
        data,
    })
}

// NOTE: load/unload (re)bind the listener this very request is being served on.
// If we awaited the swap inline, the old server's graceful shutdown would block
// on this in-flight request and deadlock. So we run the lifecycle change on a
// detached task and return `accepted` immediately; the frontend confirms via
// `GET /v1/engine/status`. The Tauri IPC commands (which run off the axum
// server) call `load_model`/`unload_model` directly and DO await completion.
async fn load(
    State(engine): State<ManagedEngine>,
    Json(options): Json<LoadModelOptions>,
) -> Json<serde_json::Value> {
    tokio::spawn(async move {
        if let Err(e) = engine.write().await.load_model(options).await {
            log::error!("/v1/engine/load failed: {e}");
        }
    });
    Json(serde_json::json!({ "status": "accepted" }))
}

async fn unload(State(engine): State<ManagedEngine>) -> Json<serde_json::Value> {
    tokio::spawn(async move {
        if let Err(e) = engine.write().await.unload_model().await {
            log::error!("/v1/engine/unload failed: {e}");
        }
    });
    Json(serde_json::json!({ "status": "accepted" }))
}
