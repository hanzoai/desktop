//! Model tools — checkpoint merging / compression (model soups + BitDelta) and
//! a developer entry point for trainer-free GRPO.
//!
//! These features are provided by the `hanzoai/ml` repo (the `hanzo-ml`
//! framework) and surfaced here so the desktop can drive them locally:
//!
//! - **`soup` CLI** (`tensor-tools` crate, `hanzo_ml::model_delta`): average
//!   checkpoints (model soup), delta-soup (base + mean fine-tune delta), and
//!   1-bit BitDelta encode/decode of a fine-tune relative to a base.
//! - **GRPO** (`hanzo_training::grpo`): trainer-free Group Relative Policy
//!   Optimization. This currently ships as a Rust library + a runnable
//!   `grpo_toy` example (there is no GRPO server/daemon yet), so the desktop
//!   drives it through `cargo run --example` as a developer preview.
//!
//! ## Invocation model
//!
//! Both shell out to native binaries, mirroring how the inference engine
//! (`hanzo-server` / hanzo-engine) is spawned in
//! [`crate::local_hanzo_node::hanzo_node_manager`]. The binary locations are
//! env-overridable so a developer build can point at a local checkout:
//!
//! - `HANZO_SOUP_BIN`  — path to the `soup` binary (default: `soup` on PATH).
//! - `HANZO_ML_DIR`    — path to a `hanzoai/ml` checkout, used to `cargo run`
//!   the GRPO example when no prebuilt binary is available.

mod commands;
mod soup;

pub use commands::*;
pub use soup::*;
