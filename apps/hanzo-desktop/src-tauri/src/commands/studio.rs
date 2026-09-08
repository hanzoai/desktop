// SPDX-License-Identifier: Apache-2.0
//! Tauri commands for the desktop-managed local studio (ComfyUI) render runtime.
//!
//! When GPU sharing is ON and this box advertises `studio.render`, the desktop
//! spawns a LOCALHOST-ONLY studio server as a managed child. The GPU-fleet worker
//! (commands/gpu.rs) forwards each claimed `studio.render` job to it at
//! 127.0.0.1:8188 and uploads the result to the org gallery. When sharing stops,
//! the studio child stops too.
//!
//! It runs with STUDIO_DISABLE_GPU_DISPATCH=1: this box IS the executor, so its
//! local studio must render locally, never re-dispatch to the fleet (which would
//! loop claim → /prompt → dispatch → claim).
//!
//! If the studio runtime (its Python venv) is absent, [`StudioManager::start`]
//! reports `available:false` so the UI can degrade the machine to `engine.serve`
//! only (LLM) and say so — no render capability without a render runtime.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::RwLock;

const STUDIO_PORT: &str = "8188";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct StudioState {
    pub running: bool,
    /// Whether a local studio runtime (venv + main.py) was found. When false the
    /// machine can only serve engine.serve (LLM), not studio.render.
    pub available: bool,
    pub error: String,
}

pub struct StudioManager {
    state: Arc<RwLock<StudioState>>,
    child: Arc<RwLock<Option<Child>>>,
}

impl Default for StudioManager {
    fn default() -> Self {
        Self::new()
    }
}

impl StudioManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(StudioState::default())),
            child: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn get_state(&self) -> StudioState {
        {
            let mut guard = self.child.write().await;
            if let Some(child) = guard.as_mut() {
                if let Ok(Some(_status)) = child.try_wait() {
                    *guard = None;
                    self.state.write().await.running = false;
                }
            }
        }
        self.state.read().await.clone()
    }

    /// Spawn the local studio server (127.0.0.1:8188, executor mode). Idempotent.
    /// Returns Ok with `available:false` (not an error) when no runtime is found,
    /// so the caller degrades to engine.serve rather than surfacing a hard failure.
    pub async fn start(&self) -> Result<StudioState, String> {
        if self.child.read().await.is_some() {
            return Ok(self.state.read().await.clone());
        }
        let Some((python, studio_dir)) = resolve_studio() else {
            let s = StudioState {
                running: false,
                available: false,
                error: "no local studio runtime found (venv absent) — render disabled".into(),
            };
            *self.state.write().await = s.clone();
            return Ok(s);
        };
        let output_dir = studio_dir.join("output");
        let mut cmd = Command::new(&python);
        cmd.current_dir(&studio_dir)
            .arg("main.py")
            .args(["--listen", "127.0.0.1", "--port", STUDIO_PORT])
            .args(["--disable-auto-launch", "--dont-print-server"])
            .arg("--output-directory")
            .arg(&output_dir)
            // This box is the executor: render locally, never re-dispatch.
            .env("STUDIO_DISABLE_GPU_DISPATCH", "1")
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        match cmd.spawn() {
            Ok(child) => {
                *self.child.write().await = Some(child);
                let s = StudioState { running: true, available: true, error: String::new() };
                *self.state.write().await = s.clone();
                Ok(s)
            }
            Err(e) => {
                let msg = format!("failed to launch local studio ({}): {e}", python.display());
                let s = StudioState { running: false, available: true, error: msg.clone() };
                *self.state.write().await = s;
                Err(msg)
            }
        }
    }

    pub async fn stop(&self) -> Result<(), String> {
        if let Some(mut child) = self.child.write().await.take() {
            // SIGINT for a graceful ComfyUI shutdown (main.py handles it), then reap.
            #[cfg(unix)]
            unsafe {
                libc::kill(child.id() as i32, libc::SIGINT);
            }
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
        self.state.write().await.running = false;
        Ok(())
    }
}

/// Locate the local studio runtime: (python, studio_dir). Resolution order:
/// HANZO_STUDIO_PYTHON + HANZO_STUDIO_DIR env, else the dev checkout
/// ~/work/hanzo/studio/.venv. Returns None when no venv python exists.
fn resolve_studio() -> Option<(PathBuf, PathBuf)> {
    let studio_dir = std::env::var("HANZO_STUDIO_DIR")
        .ok()
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs_home().map(|h| h.join("work/hanzo/studio")))?;

    let python = std::env::var("HANZO_STUDIO_PYTHON")
        .ok()
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| studio_dir.join(".venv/bin/python"));

    if python.exists() && studio_dir.join("main.py").exists() {
        Some((python, studio_dir))
    } else {
        None
    }
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var("HOME").ok().filter(|h| !h.is_empty()).map(PathBuf::from)
}

pub type StudioManagerState = Arc<StudioManager>;

#[tauri::command]
pub async fn studio_get_state(
    studio_manager: State<'_, StudioManagerState>,
) -> Result<StudioState, String> {
    Ok(studio_manager.get_state().await)
}

#[tauri::command]
pub async fn studio_start(
    studio_manager: State<'_, StudioManagerState>,
) -> Result<StudioState, String> {
    studio_manager.start().await
}

#[tauri::command]
pub async fn studio_stop(studio_manager: State<'_, StudioManagerState>) -> Result<(), String> {
    studio_manager.stop().await
}
