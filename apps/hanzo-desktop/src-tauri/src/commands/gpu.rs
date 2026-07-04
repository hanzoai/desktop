// SPDX-License-Identifier: Apache-2.0
//! Tauri commands for the "bring your GPU to Hanzo Cloud" toggle.
//!
//! The heavy lifting lives in the `hanzo gpu connect` CLI
//! (github.com/hanzoai/cloud): it authenticates, registers this machine + its
//! GPU inventory in the org's cloud fleet (visible on console.hanzo.ai's
//! Machines + GPUs pages, provider=byo), and runs an outbound worker loop.
//! This manager just spawns / stops that CLI.
//!
//! Token hand-off: the desktop keeps the IAM token in the renderer store, but
//! the Go CLI reads ~/.hanzo/credentials.json — NOT shared. So the toggle passes
//! the token to the CLI via the HANZO_TOKEN env var (cli Env.accessToken() honors
//! it), bridging the two credential stores without writing the token to disk.
//!
//! Mirrors the mining manager (commands/mining.rs) shape: an Arc-managed,
//! long-lived manager holding process state, three thin #[tauri::command] bindings.

use std::process::{Child, Command, Stdio};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::RwLock;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GpuConnectState {
    pub connected: bool,
    pub error: String,
}

pub struct GpuConnectManager {
    state: Arc<RwLock<GpuConnectState>>,
    child: Arc<RwLock<Option<Child>>>,
}

impl Default for GpuConnectManager {
    fn default() -> Self {
        Self::new()
    }
}

impl GpuConnectManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(GpuConnectState::default())),
            child: Arc::new(RwLock::new(None)),
        }
    }

    /// Current toggle state. Reaps a CLI that has exited on its own (crash,
    /// auth failure) so the UI reflects reality instead of a stale "connected".
    pub async fn get_state(&self) -> GpuConnectState {
        {
            let mut guard = self.child.write().await;
            if let Some(child) = guard.as_mut() {
                if let Ok(Some(_status)) = child.try_wait() {
                    *guard = None;
                    self.state.write().await.connected = false;
                }
            }
        }
        self.state.read().await.clone()
    }

    /// Spawn `hanzo gpu connect`, passing the IAM token via HANZO_TOKEN. Idempotent:
    /// a second start while already connected is a no-op.
    pub async fn start(&self, token: String, cloud_url: Option<String>) -> Result<(), String> {
        if token.trim().is_empty() {
            return Err("not signed in: connect your Hanzo account first".into());
        }
        if self.child.read().await.is_some() {
            return Ok(());
        }
        let bin = resolve_cli();
        let mut cmd = Command::new(&bin);
        cmd.args(["gpu", "connect"]);
        if let Some(url) = cloud_url.as_deref().filter(|u| !u.is_empty()) {
            cmd.args(["--cloud-url", url]);
        }
        cmd.env("HANZO_TOKEN", token);
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
        match cmd.spawn() {
            Ok(child) => {
                *self.child.write().await = Some(child);
                let mut s = self.state.write().await;
                s.connected = true;
                s.error = String::new();
                Ok(())
            }
            Err(e) => {
                let msg = format!("failed to launch `{bin} gpu connect`: {e}");
                self.state.write().await.error = msg.clone();
                Err(msg)
            }
        }
    }

    /// Stop the worker. Killing it stops the heartbeat, so the machine reports
    /// offline in the console shortly after (the CLI's own `disconnect` removes
    /// the row outright; the toggle keeps it simple and just stops the process).
    pub async fn stop(&self) -> Result<(), String> {
        if let Some(mut child) = self.child.write().await.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.state.write().await.connected = false;
        Ok(())
    }
}

/// resolve_cli picks the `hanzo` CLI binary: the HANZO_CLI_BIN override if set,
/// else `hanzo` from PATH.
fn resolve_cli() -> String {
    match std::env::var("HANZO_CLI_BIN") {
        Ok(p) if !p.is_empty() => p,
        _ => "hanzo".to_string(),
    }
}

pub type GpuConnectManagerState = Arc<GpuConnectManager>;

#[tauri::command]
pub async fn gpu_connect_get_state(
    gpu_connect_manager: State<'_, GpuConnectManagerState>,
) -> Result<GpuConnectState, String> {
    Ok(gpu_connect_manager.get_state().await)
}

#[tauri::command]
pub async fn gpu_connect_start(
    token: String,
    cloud_url: Option<String>,
    gpu_connect_manager: State<'_, GpuConnectManagerState>,
) -> Result<(), String> {
    gpu_connect_manager.start(token, cloud_url).await
}

#[tauri::command]
pub async fn gpu_connect_stop(
    gpu_connect_manager: State<'_, GpuConnectManagerState>,
) -> Result<(), String> {
    gpu_connect_manager.stop().await
}
