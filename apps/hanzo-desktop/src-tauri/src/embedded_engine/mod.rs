//! Embedded Hanzo Engine - High-performance AI inference
//!
//! This module provides in-process AI inference using the native Hanzo Engine
//! (the mistral.rs fork at `~/work/hanzo/engine`). It is compiled only when the
//! `native-engine` Cargo feature is enabled; pair it with a backend feature
//! (`metal`, `cuda`, `accelerate`).
//!
//! ## Architecture
//!
//! The embedded engine exposes an OpenAI-compatible HTTP API on localhost:
//! - Same API as Ollama, LM Studio, OpenAI - frontend code works with any
//! - Default port: 36900 (configurable)
//! - Endpoints: /v1/chat/completions, /v1/embeddings, /v1/models
//! - Streaming via SSE (Server-Sent Events)
//!
//! This approach provides:
//! - **Unified frontend code** - same HTTP client for all engines
//! - **Standard OpenAI SDK compatibility** - use `openai` npm package
//! - **Easy testing** - curl, Postman, any HTTP client works
//! - **No Tauri IPC overhead** for streaming responses
//!
//! ## Model Storage
//!
//! Models are stored in platform-specific locations:
//! - macOS: ~/Library/Application Support/hanzo-desktop/models/
//! - Linux: ~/.local/share/hanzo-desktop/models/
//! - Windows: %APPDATA%/hanzo-desktop/models/
//!
//! ## Build Options
//!
//! ```bash
//! cargo build --features metal  # macOS with Apple Silicon (recommended)
//! cargo build --features cuda   # Linux/Windows with NVIDIA GPU
//! cargo build                   # CPU only (slower but works everywhere)
//! ```

// This module carries more API surface than the desktop currently wires up
// (alternate loaders, embeddings types, server lifecycle helpers) so it can grow
// without churn. Silence dead-code/unused warnings for the not-yet-wired surface;
// the whole module only compiles under the `native-engine` feature.
#![allow(dead_code, unused_imports)]

mod engine;
mod server;
mod commands;
mod types;
mod zen5;

use std::sync::Arc;
use tokio::sync::RwLock;

pub use engine::EmbeddedEngine;
pub use server::{EmbeddedEngineServer, DEFAULT_PORT};
pub use commands::*;
pub use types::*;
pub use zen5::*;

/// Build a fresh, shared engine state. The same `Arc` is handed to Tauri's
/// `.manage()` (for IPC commands) and to the HTTP server, so both reach the
/// one engine instance.
pub fn new_state() -> EmbeddedEngineState {
    Arc::new(RwLock::new(EmbeddedEngine::new()))
}
