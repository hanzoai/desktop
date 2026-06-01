//! Tauri-side bindings for the `hanzo-machined` Go daemon.
//!
//! All traffic flows over a UNIX socket at `~/.hanzo/run/machined.sock`
//! (override with `HANZO_MACHINED_SOCKET`). The socket location and protocol
//! are owned by `hanzo-machined`; this crate only consumes them.

pub mod client;
pub mod commands;
pub mod socket;
pub mod types;

#[allow(unused_imports)]
pub use client::{MachinedClient, MachinedError};
#[allow(unused_imports)]
pub use types::{
    Distro, ExecFrame, ExecStream, Health, Machine, MachineEvent, MachineSpec, MachineState,
};
