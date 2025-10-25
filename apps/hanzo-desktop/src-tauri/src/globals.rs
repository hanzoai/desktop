
use std::sync::Arc;

use crate::local_hanzo_node::hanzo_node_manager::HanzoNodeManager;
use once_cell::sync::OnceCell;

pub static HANZO_NODE_MANAGER_INSTANCE: OnceCell<Arc<tokio::sync::RwLock<HanzoNodeManager>>> =
    OnceCell::new();
