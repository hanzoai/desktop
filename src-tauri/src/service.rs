//! The two local processes the desktop keeps alive.
//!
//! A service is a binary, its arguments, its environment, and the URL that
//! answers when it is serving. Everything else — where it is found, where it
//! writes, how it is started, stopped and observed — is the same for all of
//! them and written once.

use std::collections::HashMap;
use std::ffi::OsString;
use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

struct Service {
    name: &'static str,
    bin: &'static str,
    args: &'static [&'static str],
    env: &'static [(&'static str, &'static str)],
    /// Answers 2xx once the service is serving.
    health: &'static str,
}

/// The environment keys are the node's own, spelled as it reads them
/// (`hanzo-bin/hanzo-node/src/utils/environment.rs`). It binds every interface
/// by default; a desktop binds the loopback.
///
/// Its HTTP surface is mounted at `/v1/node`, so that is where health lives.
const SERVICES: [Service; 2] = [
    Service {
        name: "engine",
        bin: "hanzo-engine",
        args: &[
            "serve",
            "-p",
            "36900",
            "auto",
            "-m",
            "zenlm/zen-eco-4b-agent-gguf",
            "-f",
            "zen-eco-3b-agent-q4_k_m.gguf",
            "--format",
            "gguf",
        ],
        env: &[],
        health: "http://127.0.0.1:36900/health",
    },
    Service {
        name: "node",
        bin: "hanzod",
        args: &[],
        env: &[
            ("NODE_IP", "127.0.0.1"),
            ("NODE_PORT", "9552"),
            ("NODE_API_IP", "127.0.0.1"),
            ("NODE_API_PORT", "3690"),
            // The chat socket is the API port plus one.
            ("NODE_WS_PORT", "3691"),
            ("NODE_API_HTTPS_PORT", "9553"),
        ],
        health: "http://127.0.0.1:3690/v1/node/health_check",
    },
];

/// How long a service may take to answer before a spawn is called failed. A
/// cold engine loads its weights first.
const PATIENCE: Duration = Duration::from_secs(120);
const PROBE: Duration = Duration::from_millis(500);

/// The children we started. Nothing else is ours to kill.
#[derive(Default)]
pub struct Registry(Mutex<HashMap<&'static str, Child>>);

impl Registry {
    fn hold(&self, name: &'static str, child: Child) {
        self.0.lock().unwrap().insert(name, child);
    }

    fn release(&self, name: &str) -> Option<Child> {
        self.0.lock().unwrap().remove(name)
    }

    fn holds(&self, name: &str) -> bool {
        self.0.lock().unwrap().contains_key(name)
    }

    /// Stop everything we started. Called when the app exits, so a relaunch
    /// finds its ports free.
    pub fn clear(&self) {
        for (_, child) in self.0.lock().unwrap().drain() {
            end(child);
        }
    }
}

fn end(mut child: Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn find(name: &str) -> Result<&'static Service, String> {
    SERVICES
        .iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("no service named {name}"))
}

/// The binary that ships beside the app, else whatever the PATH offers. An
/// absolute default would exist on one machine.
fn locate(name: &str) -> OsString {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(name)))
        .filter(|path| path.exists())
        .map(Into::into)
        .unwrap_or_else(|| name.into())
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

async fn up(health: &str) -> bool {
    client()
        .get(health)
        .timeout(PROBE)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

async fn settle(health: &str) -> Result<(), String> {
    let deadline = std::time::Instant::now() + PATIENCE;
    while std::time::Instant::now() < deadline {
        if up(health).await {
            return Ok(());
        }
        tokio::time::sleep(PROBE).await;
    }
    Err(format!("{health} never answered"))
}

/// Start a service and resolve once it answers. A service already serving is
/// adopted rather than duplicated, so this is safe to call at every launch.
#[tauri::command]
pub async fn spawn(
    app: AppHandle,
    registry: State<'_, Registry>,
    name: String,
) -> Result<(), String> {
    let service = find(&name)?;
    if up(service.health).await {
        return Ok(());
    }
    if let Some(child) = registry.release(service.name) {
        end(child);
    }

    // Services keep their files under the working directory: the node's own
    // storage default is relative, and one rule beats a path per service.
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no data directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot make {}: {e}", dir.display()))?;

    let child = Command::new(locate(service.bin))
        .args(service.args)
        .envs(service.env.iter().copied())
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("cannot start {}: {e}", service.bin))?;
    registry.hold(service.name, child);

    settle(service.health).await
}

/// Stop a service we started. One we adopted stays up — it is not ours.
#[tauri::command]
pub async fn stop(registry: State<'_, Registry>, name: String) -> Result<(), String> {
    let service = find(&name)?;
    if let Some(child) = registry.release(service.name) {
        end(child);
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Health {
    name: &'static str,
    /// This app started it, so this app can stop it.
    own: bool,
    /// It answers.
    up: bool,
}

#[tauri::command]
pub async fn status(registry: State<'_, Registry>) -> Result<Vec<Health>, String> {
    let mut all = Vec::with_capacity(SERVICES.len());
    for service in &SERVICES {
        let own = registry.holds(service.name);
        all.push(Health {
            name: service.name,
            own,
            up: up(service.health).await,
        });
    }
    Ok(all)
}
