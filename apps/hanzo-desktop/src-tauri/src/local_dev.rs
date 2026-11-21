//! The Dev server on this computer, as a runtime for the shell's Dev (`@hanzo/app`'s
//! `configure({ runtime })`). Hanzo Dev's server publishes where it listens in its data
//! directory (`userdata/server-runtime.json`) and issues one-time pairing credentials through
//! its own CLI; this reads the first and asks the second, so the window never holds a secret
//! longer than one pairing. The server is Hanzo Dev's: this app supervises none of its own.

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Published {
    host: Option<String>,
    port: u16,
    origin: String,
}

#[derive(Serialize)]
pub struct LocalDev {
    pub id: String,
    pub origin: String,
}

fn home() -> PathBuf {
    if let Ok(explicit) = std::env::var("HANZO_DEV_HOME") {
        if !explicit.trim().is_empty() {
            return PathBuf::from(explicit.trim());
        }
    }
    dirs::home_dir().unwrap_or_default().join(".hanzo-dev")
}

fn node() -> PathBuf {
    for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return path;
        }
    }
    PathBuf::from("node")
}

fn server_cli() -> Option<PathBuf> {
    let explicit = std::env::var("HANZO_DEV_SERVER").ok().map(PathBuf::from);
    let bundled = PathBuf::from(
        "/Applications/Hanzo Dev.app/Contents/Resources/resources/server/dist/bin.mjs",
    );
    explicit.into_iter().chain([bundled]).find(|p| p.is_file())
}

/// The running local Dev server, or none: its published address, answering on its port.
#[tauri::command]
pub fn dev_local_runtime() -> Option<LocalDev> {
    let userdata = home().join("userdata");
    let published: Published =
        serde_json::from_slice(&std::fs::read(userdata.join("server-runtime.json")).ok()?).ok()?;
    let host = published.host.as_deref().unwrap_or("127.0.0.1");
    let addr: SocketAddr = format!("{host}:{}", published.port).parse().ok()?;
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok()?;
    let id = std::fs::read_to_string(userdata.join("environment-id"))
        .ok()?
        .trim()
        .to_string();
    Some(LocalDev { id, origin: published.origin })
}

/// One one-time pairing credential for the local Dev server (its CLI issues it).
#[tauri::command]
pub fn dev_local_pairing() -> Result<String, String> {
    let cli = server_cli().ok_or("Hanzo Dev is not installed on this computer.")?;
    let out = Command::new(node())
        .arg(cli)
        .args(["auth", "pairing", "create", "--json", "--ttl", "5m", "--label", "Hanzo"])
        .arg("--base-dir")
        .arg(home())
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let issued: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    issued["credential"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "Hanzo Dev issued no credential.".to_string())
}
