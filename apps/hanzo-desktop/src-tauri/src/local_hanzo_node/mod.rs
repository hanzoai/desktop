pub mod process_handlers;
pub mod hanzo_node_manager;
pub mod hanzo_node_options;
pub mod session;

/// The hanzo-node release this bundle carries (`HANZO_NODE_VERSION` in
/// `pins`, read by build.rs). It decides the embeddings env the node is given:
/// see hanzo-node-env.
pub const PINNED_NODE_VERSION: &str = env!("HANZO_NODE_VERSION");
