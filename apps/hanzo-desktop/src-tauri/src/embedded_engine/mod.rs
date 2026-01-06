//! Embedded Hanzo Engine - High-performance AI inference
//!
//! This module provides in-process AI inference using Hanzo Engine.
//! It's always included - this is the default inference backend.
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

mod engine;
mod server;
mod commands;
mod types;

pub use engine::EmbeddedEngine;
pub use server::{EmbeddedEngineServer, DEFAULT_PORT};
pub use commands::*;
pub use types::*;
