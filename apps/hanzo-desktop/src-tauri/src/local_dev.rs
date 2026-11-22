//! Local backend discovery for Hanzo Desktop (`@hanzo/app`'s `configure({ runtime })`).
//!
//! Primary path (HIP-1330): connects directly to the unified single-binary Rust
//! daemon `hanzod` on `127.0.0.1:3690` (`~/.hanzo/bin/hanzod`, auto-started if
//! installed and not yet listening) — zero Node.js dependency.
//!
//! Legacy fallback: if `hanzod` is not installed, discovers a running Hanzo Dev
//! server via `~/.hanzo-dev/userdata/server-runtime.json`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};

const HANZOD_ADDR: &str = "127.0.0.1:3690";

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

fn hanzod_bin() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(explicit) = std::env::var("HANZOD_BIN") {
        if !explicit.trim().is_empty() {
            candidates.push(PathBuf::from(explicit.trim()));
        }
    }
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".hanzo").join("bin").join("hanzod"));
    }
    candidates.push(PathBuf::from("/usr/local/bin/hanzod"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/hanzod"));
    candidates.into_iter().find(|p| p.is_file())
}

fn probe_hanzod() -> bool {
    let Ok(addr) = HANZOD_ADDR.parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    let req = format!("GET /v1/dev/health HTTP/1.1\r\nHost: {HANZOD_ADDR}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 256];
    matches!(stream.read(&mut buf), Ok(n) if n > 0 && std::str::from_utf8(&buf[..n]).unwrap_or("").contains("200 OK"))
}

fn ensure_hanzod_running() -> bool {
    if probe_hanzod() {
        return true;
    }
    let Some(bin) = hanzod_bin() else {
        return false;
    };
    let spawn_ok = Command::new(&bin)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok();
    if !spawn_ok {
        return false;
    }
    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(120));
        if probe_hanzod() {
            return true;
        }
    }
    false
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

/// The running local backend: prefers unified Rust `hanzod` (`127.0.0.1:3690`),
/// falling back to a legacy local Dev server only if `hanzod` is absent.
#[tauri::command]
pub fn dev_local_runtime() -> Option<LocalDev> {
    if ensure_hanzod_running() {
        return Some(LocalDev {
            id: "hanzod".to_string(),
            origin: format!("http://{HANZOD_ADDR}"),
        });
    }

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

/// Pairing credential for the local runtime (`hanzod` uses shared IAM identity;
/// legacy Hanzo Dev uses its CLI one-time token).
#[tauri::command]
pub fn dev_local_pairing() -> Result<String, String> {
    if probe_hanzod() {
        return Ok("hanzod-native".to_string());
    }
    let cli = server_cli().ok_or("hanzod is not running and Hanzo Dev is not installed on this computer.")?;
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
