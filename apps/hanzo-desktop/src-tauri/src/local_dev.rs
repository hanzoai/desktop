//! Local backend discovery for Hanzo Desktop (`@hanzo/app`'s `configure({ runtime })`).
//!
//! Primary path (HIP-1330 & HIP-1400..1404): connects directly to the unified
//! single-binary Rust daemon `hanzod` on `127.0.0.1:3690` — resolved from the
//! bundled Desktop sidecar directory first, then `~/.hanzo/bin/hanzod` /
//! `~/.local/bin/hanzod`, and auto-started if installed and not yet listening.
//! Also probes `/v1/research/health` so Desktop surfaces native Hanzo Dō
//! research + `hanzo-vm` sandbox execution.
//!
//! Legacy fallback: if `hanzod` is not installed, discovers a running Hanzo Dev
//! server via `~/.hanzo-dev/userdata/server-runtime.json`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LocalDev {
    pub id: String,
    pub origin: String,
    pub hostname: Option<String>,
    pub research: bool,
    pub sandbox: Option<String>,
}

fn local_short_hostname() -> Option<String> {
    if let Ok(out) = Command::new("hostname").arg("-s").output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .ok()
        .map(|s| s.split('.').next().unwrap_or(&s).trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn sidecar_candidates_for_exe(exe: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let names: &[&str] = if cfg!(windows) {
        &["hanzod.exe", "hanzod"]
    } else {
        &["hanzod"]
    };
    if let Some(dir) = exe.parent() {
        for name in names {
            out.push(dir.join(name));
            out.push(dir.join("binaries").join(name));
        }
        if let Some(parent) = dir.parent() {
            for name in names {
                out.push(parent.join("Resources").join(name));
                out.push(parent.join("Resources").join("binaries").join(name));
                out.push(parent.join("lib").join("hanzo-desktop").join(name));
            }
        }
    }
    out
}

fn hanzod_bin() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(explicit) = std::env::var("HANZOD_BIN") {
        if !explicit.trim().is_empty() {
            candidates.push(PathBuf::from(explicit.trim()));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        candidates.extend(sidecar_candidates_for_exe(&exe));
    }
    let names: &[&str] = if cfg!(windows) {
        &["hanzod.exe", "hanzod"]
    } else {
        &["hanzod"]
    };
    if let Some(home) = dirs::home_dir() {
        for name in names {
            candidates.push(home.join(".hanzo").join("bin").join(name));
            candidates.push(home.join(".local").join("bin").join(name));
        }
    }
    candidates.push(PathBuf::from("/usr/local/bin/hanzod"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/hanzod"));
    if let Ok(path_var) = std::env::var("PATH") {
        for entry in std::env::split_paths(&path_var) {
            for name in names {
                candidates.push(entry.join(name));
            }
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn http_get_addr(addr_str: &str, path: &str) -> Option<(u16, String)> {
    let addr: SocketAddr = addr_str.parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(250)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    let req = format!("GET {path} HTTP/1.1\r\nHost: {addr_str}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = Vec::with_capacity(1024);
    let _ = stream.read_to_end(&mut buf);
    let raw = String::from_utf8_lossy(&buf);
    let (head, body) = raw.split_once("\r\n\r\n")?;
    let code: u16 = head
        .lines()
        .next()?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()?;
    Some((code, body.to_string()))
}

fn probe_hanzod_at(addr: &str) -> bool {
    matches!(http_get_addr(addr, "/v1/dev/health"), Some((200, _)))
}

fn probe_research_at(addr: &str) -> (bool, Option<String>) {
    let Some((200, body)) = http_get_addr(addr, "/v1/research/health") else {
        return (false, None);
    };
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
    let ok = parsed.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
    let sandbox = parsed
        .get("sandbox")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    (ok, sandbox)
}

fn probe_hanzod() -> bool {
    probe_hanzod_at(HANZOD_ADDR)
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
    let hostname = local_short_hostname();
    if ensure_hanzod_running() {
        let (research, sandbox) = probe_research_at(HANZOD_ADDR);
        return Some(LocalDev {
            id: "hanzod".to_string(),
            origin: format!("http://{HANZOD_ADDR}"),
            hostname,
            research,
            sandbox,
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
    Some(LocalDev {
        id,
        origin: published.origin,
        hostname,
        research: false,
        sandbox: None,
    })
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn sidecar_candidates_cover_macos_linux_and_adjacent_layouts() {
        let exe = PathBuf::from("/Applications/Hanzo.app/Contents/MacOS/hanzo-desktop");
        let paths = sidecar_candidates_for_exe(&exe);
        assert!(paths.iter().any(|p| p.ends_with("MacOS/hanzod") || p.ends_with("MacOS\\hanzod.exe")));
        assert!(paths.iter().any(|p| p.to_string_lossy().contains("Resources")));
    }

    #[test]
    fn probe_detects_dev_and_research_health_over_loopback() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        let handle = std::thread::spawn(move || {
            for _ in 0..2 {
                let (mut sock, _) = listener.accept().unwrap();
                let mut req = [0u8; 512];
                let n = sock.read(&mut req).unwrap();
                let line = String::from_utf8_lossy(&req[..n]);
                let body = if line.contains("/v1/research/health") {
                    r#"{"ok":true,"sandbox":"hanzo-vm"}"#
                } else {
                    r#"{"ok":true}"#
                };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                sock.write_all(resp.as_bytes()).unwrap();
            }
        });

        assert!(probe_hanzod_at(&addr));
        let (research_ok, sandbox) = probe_research_at(&addr);
        assert!(research_ok);
        assert_eq!(sandbox.as_deref(), Some("hanzo-vm"));
        handle.join().unwrap();
    }
}
