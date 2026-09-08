//! Server constants for the embedded Hanzo Engine.
//!
//! There is no hand-rolled server type here anymore, and no separate server
//! abstraction: the canonical `hanzo-server-core` stack IS the server, and
//! [`super::engine::EmbeddedEngine`] owns its whole lifecycle (build the
//! `SharedState` via `ServerBuilder`, bind the
//! `RouterBuilder` router, swap on model change). This module just
//! holds the port the canonical server binds on.

/// Default port for the embedded engine server. The frontend engine client
/// (`client.ts` / `ENGINE_BASE_URL`) targets `127.0.0.1:36900` by default, so
/// the canonical server binds there.
pub const DEFAULT_PORT: u16 = 36900;
