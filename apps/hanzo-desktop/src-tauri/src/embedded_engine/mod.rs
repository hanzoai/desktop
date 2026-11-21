//! Embedded Hanzo Engine - High-performance AI inference
//!
//! This module provides in-process AI inference using Hanzo Engine.
//! It's always included - this is the default inference backend.
//!
//! ## Architecture
//!
//! The embedded engine exposes an OpenAI-compatible HTTP API on localhost,
//! under the canonical `/v1/engine/*` contract (matching the external engine):
//! - Chat:       POST /v1/engine/chat/completions  (streaming + non-streaming)
//! - Models:     GET  /v1/engine/models
//! - Embeddings: POST /v1/engine/embeddings
//! - Health:     GET  /health   (at ROOT)
//! - Default ports: 36900 (chat), 36901 (embeddings)
//! - Streaming via SSE (Server-Sent Events)
//!
//! Gated behind the `HANZO_EMBEDDED_ENGINE` env flag (default OFF). When off,
//! the desktop spawns the external `mistralrs-server` processes instead.
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

mod engine;
mod server;
mod commands;
mod types;
mod lifecycle;

pub use engine::{EmbeddedEngine, EngineMode};
pub use server::{EmbeddedEngineServer, DEFAULT_PORT};
pub use commands::*;
pub use types::*;
pub use lifecycle::{is_enabled, start, EmbeddedEngines, EMBEDDED_ENGINE_FLAG};
