//! Global state singletons for the application

use std::sync::Arc;

use crate::embedded_engine::{EmbeddedEngine, EmbeddedEngineServer};
use crate::local_hanzo_node::hanzo_node_manager::HanzoNodeManager;
use once_cell::sync::OnceCell;
use tokio::sync::RwLock;

/// Hanzo Node Manager - manages external hanzo-node process (optional sidecar)
pub static HANZO_NODE_MANAGER_INSTANCE: OnceCell<Arc<RwLock<HanzoNodeManager>>> =
    OnceCell::new();

/// Embedded Hanzo Engine - in-process AI inference (default)
pub static EMBEDDED_ENGINE_INSTANCE: OnceCell<Arc<RwLock<EmbeddedEngine>>> =
    OnceCell::new();

/// Embedded Engine HTTP Server - OpenAI-compatible API on localhost:36900
pub static EMBEDDED_ENGINE_SERVER: OnceCell<Arc<RwLock<EmbeddedEngineServer>>> =
    OnceCell::new();
