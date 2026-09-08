// SPDX-License-Identifier: Apache-2.0
//! Tauri commands for the "Share this device's GPU with Hanzo Cloud" toggle.
//!
//! The desktop is the ONLY thing a GPU owner runs. When the owner turns sharing
//! ON, this manager spawns the light, open Rust worker `hanzo-fleet-worker`
//! (crate `hanzo-gpu-fleet`, the SAME loop that folds into hanzod) as a managed
//! child. The worker registers this machine + its GPUs in the org's cloud fleet,
//! heartbeats, and claims `studio.render` jobs — forwarding each to the local
//! studio (ComfyUI) child and uploading results to the org gallery.
//!
//! Token hand-off: the desktop holds the owner's IAM session token in memory and
//! passes it to the worker via the `HANZO_TOKEN` env var. NOTHING is written to
//! disk — no credentials file, no secret on the box. Stop/logout kills the child
//! (heartbeat stops → machine goes offline).
//!
//! DEPRECATED-FOR-DESKTOP: the previous implementation spawned the private Go
//! `hanzo gpu connect` CLI (the 430MB unified cloud binary). Shipping a private
//! cloud binary to every GPU owner violated "hanzod stays light + open". The Go
//! CLI remains only for standalone/headless use; the desktop now drives the Rust
//! worker, which is the one and only claim loop.

use std::process::{Child, Command, Stdio};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::RwLock;

/// Where the worker forwards renders + uploads results. Overridable for staging.
const DEFAULT_COMFYUI_URL: &str = "http://127.0.0.1:8188";
const DEFAULT_STUDIO_URL: &str = "https://studio.hanzo.ai";
const DEFAULT_CLOUD_URL: &str = "https://api.hanzo.ai";

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

    /// Current toggle state. Reaps a worker that exited on its own (crash, auth
    /// failure) so the UI reflects reality instead of a stale "connected".
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

    /// Spawn `hanzo-fleet-worker`, passing the IAM token via HANZO_TOKEN and the
    /// local studio + gallery endpoints via env. Idempotent: a second start while
    /// already connected is a no-op.
    pub async fn start(&self, token: String, cloud_url: Option<String>) -> Result<(), String> {
        if token.trim().is_empty() {
            return Err("not signed in: connect your Hanzo account first".into());
        }
        if self.child.read().await.is_some() {
            return Ok(());
        }
        let bin = resolve_worker_bin();
        let mut cmd = Command::new(&bin);
        cmd.env("HANZO_TOKEN", token);
        cmd.env(
            "HANZO_CLOUD_URL",
            cloud_url.filter(|u| !u.is_empty()).unwrap_or_else(|| DEFAULT_CLOUD_URL.to_string()),
        );
        cmd.env("HANZO_COMFYUI_URL", env_or("HANZO_COMFYUI_URL", DEFAULT_COMFYUI_URL));
        cmd.env("HANZO_STUDIO_URL", env_or("HANZO_STUDIO_URL", DEFAULT_STUDIO_URL));
        cmd.env("RUST_LOG", env_or("RUST_LOG", "info"));
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
                let msg = format!("failed to launch `{bin} ` fleet worker: {e}");
                self.state.write().await.error = msg.clone();
                Err(msg)
            }
        }
    }

    /// Stop the worker. On graceful SIGTERM it marks the machine offline; kill is
    /// the fallback. Either way the heartbeat stops and the console shows offline.
    pub async fn stop(&self) -> Result<(), String> {
        if let Some(mut child) = self.child.write().await.take() {
            // SIGTERM first so the worker's shutdown path marks the machine
            // offline immediately (its own disconnect); then reap. Without it the
            // machine would only drop after the ~90s heartbeat window.
            #[cfg(unix)]
            unsafe {
                libc::kill(child.id() as i32, libc::SIGTERM);
            }
            // Give the graceful offline a brief moment, then ensure it's gone.
            for _ in 0..20 {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    _ => std::thread::sleep(std::time::Duration::from_millis(100)),
                }
            }
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
        self.state.write().await.connected = false;
        Ok(())
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| default.to_string())
}

/// Resolve the `hanzo-fleet-worker` binary: the HANZO_FLEET_WORKER_BIN override
/// (used in dev to point at the cargo target), else `hanzo-fleet-worker` from
/// PATH (bundled alongside the app in release).
fn resolve_worker_bin() -> String {
    match std::env::var("HANZO_FLEET_WORKER_BIN") {
        Ok(p) if !p.is_empty() => p,
        _ => "hanzo-fleet-worker".to_string(),
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
