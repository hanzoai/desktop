//! Embedded Hanzo Engine - in-process AI inference.
//!
//! The desktop's embedded engine IS the canonical `hanzo-server-core` server.
//! Loading a model builds the same `SharedState` that `hanzo serve` builds
//! (via `ServerBuilder`) and serves the same axum `Router` (via
//! `RouterBuilder`) on `127.0.0.1:36900`. The node therefore speaks
//! every protocol at once -- OpenAI `/v1/chat/completions`, codex/hanzo-dev
//! `/v1/responses`, and Anthropic/Claude-Code `/v1/messages` -- with zero
//! duplicated route logic. A thin `/v1/engine/*` management surface (status /
//! models / load / unload) is merged on top for the desktop frontend.
//!
//! Compiled only under the `native-engine` Cargo feature; pair it with a
//! backend feature (`metal`, `cuda`, `vulkan`, `accelerate`).
//!
//! ## Architecture
//!
//! - [`EmbeddedEngine`] (engine.rs) -- the single orchestrator. Owns the
//!   canonical state + the whole server lifecycle (build, bind, swap, stop).
//!   One model-load path.
//! - server.rs -- just the `DEFAULT_PORT` the canonical server binds on.
//! - management.rs -- the `/v1/engine/*` lifecycle routes (no inference).
//! - commands.rs -- Tauri IPC mirror of the lifecycle routes.
//! - zen5.rs -- the Zen model catalog for the picker.
//!
//! ## Build
//!
//! ```bash
//! cargo build --features "native-engine metal"   # Apple Silicon
//! cargo build --features "native-engine cuda"     # NVIDIA
//! cargo build --features "native-engine vulkan"   # AMD/Linux
//! cargo build --features native-engine            # CPU only
//! ```

// zen5.rs carries a catalog whose fields aren't all read yet; silence dead-code
// for the not-yet-wired surface. The module only compiles under `native-engine`.
#![allow(dead_code)]

mod commands;
mod engine;
mod management;
mod server;
mod types;
mod zen5;

use std::sync::Arc;
use tokio::sync::RwLock;

pub use commands::*;
pub use engine::EmbeddedEngine;
pub use server::DEFAULT_PORT;
pub use types::*;
pub use zen5::*;

/// Build a fresh, shared engine orchestrator. The same `Arc` is handed to
/// Tauri's `.manage()` (for IPC commands) and to the `/v1/engine/*` management
/// router (via [`EmbeddedEngine::set_management_state`]), so both reach the one
/// engine instance and its one model-load path.
///
/// The orchestrator keeps a clone of this `Arc` so the management routes it
/// builds at server (re)start can call back into it. The write lock is taken
/// synchronously here: the `Arc` has no other holders yet, so `try_write`
/// cannot fail (and we avoid blocking on a runtime inside Tauri's `setup`).
pub fn new_state() -> EmbeddedEngineState {
    let state = Arc::new(RwLock::new(EmbeddedEngine::new()));
    state
        .try_write()
        .expect("freshly created engine lock is uncontended")
        .set_management_state(state.clone());
    state
}
