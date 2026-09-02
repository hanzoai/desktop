//! The local processes the desktop keeps alive.
//!
//! A service is a binary, its arguments, its environment, and the URL that
//! answers when it is serving. Everything else — where it is found, where it
//! writes, how it is started, stopped and observed — is the same for all of
//! them and written once.

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
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

/// One engine serves chat and another serves embeddings: a model answers for
/// its own category and refuses the other.
///
/// The node's keys are spelled as it reads them
/// (`hanzo-bin/hanzo-node/src/utils/environment.rs`). It binds every interface
/// by default, where a desktop binds the loopback. Every port is stated because
/// it refuses to start unless it can claim each one, and the embedding address
/// because it refuses to start without it. Its HTTP surface is mounted at
/// `/v1/node`, so that is where health lives.
const SERVICES: [Service; 3] = [
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
        name: "embedding",
        bin: "hanzo-engine",
        args: &[
            "serve",
            "-p",
            "36901",
            "embedding",
            "-m",
            "zenlm/zen-embedding-0.6B",
        ],
        env: &[],
        health: "http://127.0.0.1:36901/health",
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
            ("NODE_ZAP_IP", "127.0.0.1"),
            ("NODE_ZAP_PORT", "3692"),
            ("EMBEDDINGS_SERVER_URL", "http://127.0.0.1:36901"),
        ],
        health: "http://127.0.0.1:3690/v1/node/health_check",
    },
];

/// How long a service may take to answer before a spawn is called failed. A
/// cold engine loads its weights first.
const PATIENCE: Duration = Duration::from_secs(120);
const PROBE: Duration = Duration::from_millis(500);

/// How much of a service's output is worth showing. A log is read when it is
/// looked at, so the tail is the whole cost.
const TAIL: usize = 400;

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

/// Where the services keep their files. The node's own storage default is
/// relative, so one working directory beats a path per service.
fn home(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no data directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot make {}: {e}", dir.display()))?;
    Ok(dir)
}

fn log(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(home(app)?.join(format!("{name}.log")))
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
///
/// Output goes to a file beside the service's own storage, because that is the
/// only place it survives the process that wrote it — which is exactly when
/// somebody wants to read it.
pub async fn start(app: &AppHandle, name: &str) -> Result<(), String> {
    let service = find(name)?;
    if up(service.health).await {
        return Ok(());
    }
    let registry = app.state::<Registry>();
    if let Some(child) = registry.release(service.name) {
        end(child);
    }

    let dir = home(app)?;
    let file = std::fs::File::create(log(app, service.name)?)
        .map_err(|e| format!("cannot open the log for {}: {e}", service.name))?;
    let errors = file
        .try_clone()
        .map_err(|e| format!("cannot open the log for {}: {e}", service.name))?;

    let child = Command::new(locate(service.bin))
        .args(service.args)
        .envs(service.env.iter().copied())
        .current_dir(&dir)
        .stdout(Stdio::from(file))
        .stderr(Stdio::from(errors))
        .spawn()
        .map_err(|e| format!("cannot start {}: {e}", service.bin))?;
    registry.hold(service.name, child);

    settle(service.health).await
}

#[tauri::command]
pub async fn spawn(app: AppHandle, name: String) -> Result<(), String> {
    start(&app, &name).await
}

/// Start everything this machine serves, without holding up the window. The
/// node refuses to boot before the embedder answers, so they race and the node
/// waits for the port rather than for a turn.
pub fn boot(app: &AppHandle) {
    for service in &SERVICES {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = start(&app, service.name).await {
                eprintln!("{}: {e}", service.name);
            }
        });
    }
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
    /// Where it answers. Stated once, here, so nothing downstream writes a port.
    at: &'static str,
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
            at: service.health,
        });
    }
    Ok(all)
}

/// The end of what a service has said. A service that has never run has said
/// nothing, which is an empty answer rather than a failure.
#[tauri::command]
pub async fn logs(app: AppHandle, name: String) -> Result<String, String> {
    let service = find(&name)?;
    let text = std::fs::read_to_string(log(&app, service.name)?).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    Ok(lines[lines.len().saturating_sub(TAIL)..].join("\n"))
}
