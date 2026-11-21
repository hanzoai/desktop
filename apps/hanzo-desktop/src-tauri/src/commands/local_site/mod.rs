//! Redesigning a site, the window's half (hanzo-inc/app issue 312).
//!
//! A person pastes a site's address. The agent that rebuilds it works in a
//! folder with no network, so the window does what the agent cannot:
//!
//!   `local_site_folder`   a new folder under ~/Hanzo for the redesign
//!   `local_site_capture`  open the site, save a copy of it for the agent
//!                         (`page.rs`), and a picture of it from the person's own
//!                         browser when one is paired
//!   `local_preview_start` serve the folder's `redesign/` live (`preview.rs`)
//!   `local_preview_open`  show that address in Chrome, else the default browser
//!   `local_preview_stop`  stop serving it
//!
//! The agent itself runs through `local_workspace_run_dev`, as any run does.

mod fetch;
mod page;
mod preview;

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;

pub use preview::{stop_all, Preview};

/// What a redesign is built in: where the agent works, and where the preview is served from.
const BUILT: &str = "redesign";

/// The folder a redesign goes in.
#[derive(Serialize, Debug, PartialEq)]
pub struct SiteFolder {
    pub name: String,
    pub path: String,
}

/// What `local_site_capture` saved.
#[derive(Serialize, Debug, PartialEq)]
pub struct SiteSaved {
    /// What the site calls itself, or its address.
    pub title: String,
    /// Where the site ended, after any redirects.
    pub url: String,
    /// The files saved under `.hanzo/reference/`.
    pub files: Vec<String>,
    /// Whether the saved copy includes a picture of the page.
    pub screenshot: bool,
}

/// A folder name from what a host sent: lowercase letters, digits and single dashes.
fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_matches('-');
    if out.is_empty() {
        "site-redesign".to_string()
    } else {
        out.chars().take(60).collect::<String>().trim_matches('-').to_string()
    }
}

/// `<base>/<name>`, or `<name>-2`, `-3`… when that is taken: a redesign never lands in a folder that has work in it.
fn free_folder(base: &Path, name: &str) -> PathBuf {
    let name = slug(name);
    (1u32..)
        .map(|n| base.join(if n == 1 { name.clone() } else { format!("{name}-{n}") }))
        .find(|at| !at.exists())
        .expect("a name that is free")
}

/// The folder a redesign goes in: a new one in a folder called Hanzo in the person's home folder (Documents is not read or written: macOS asks permission for it).
/// It is named here and made when the site is saved (`local_site_capture`), so a site that will not open leaves nothing behind.
#[tauri::command]
pub async fn local_site_folder(name: String) -> Result<SiteFolder, String> {
    let home = dirs::home_dir().ok_or("Hanzo could not find your home folder.")?;
    let at = free_folder(&home.join("Hanzo"), &name);
    Ok(SiteFolder {
        name: at.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        path: at.to_string_lossy().into_owned(),
    })
}

/// The browser the person has paired with Hanzo, over ZAP (`commands::browser`); on a system with no such bridge, none.
#[cfg(unix)]
struct Paired;

#[cfg(unix)]
impl page::Browse for Paired {
    async fn call(&self, method: &str, params: std::collections::HashMap<String, String>) -> Result<serde_json::Value, String> {
        super::browser::browser(method.to_string(), params).await
    }
}

#[cfg(unix)]
use Paired as Eye;
#[cfg(not(unix))]
use page::Nobody as Eye;

/// Open `url`, save a copy of it under `<dir>/.hanzo/reference` for the agent (making `dir` if it is new), and say what was saved.
/// The page and its stylesheets come from this computer's own connection and are never sent anywhere.
#[tauri::command]
pub async fn local_site_capture(url: String, dir: String) -> Result<SiteSaved, String> {
    capture(&url, &dir, &Eye).await
}

/// `local_site_capture` with the browser it takes its picture from named.
async fn capture<B: page::Browse>(url: &str, dir: &str, eye: &B) -> Result<SiteSaved, String> {
    let dir = PathBuf::from(dir);
    if dir.exists() && !dir.is_dir() {
        return Err("That is not a folder.".into());
    }
    let url = fetch::address(url)?;
    let fetched = fetch::page(&url).await?;
    // The stylesheets of the page that was reached are opened by the rule the person's typing earned: a page that
    // began on this computer or a private network and ended on a public site has no private address to ask for.
    let local = fetch::typed_local(&url) && fetch::typed_local(&fetched.url);
    let html = String::from_utf8_lossy(&fetched.body).into_owned();
    let read = page::read(fetched.url, &html);

    let mut sheets = Vec::new();
    for at in &read.sheets {
        // A stylesheet that will not come is one the agent reads without; the page is what matters.
        if let Ok(got) = fetch::sheet(at, local).await {
            sheets.push((at.clone(), got.body));
        }
    }

    // How it looks, from the person's own browser when one is paired: best effort, never required.
    let shot = tokio::time::timeout(Duration::from_secs(30), page::shoot(eye, read.url.as_str(), Duration::from_secs(3), Duration::from_secs(12)))
        .await
        .ok()
        .flatten();

    let title = if read.title.is_empty() { read.url.to_string() } else { read.title.clone() };
    let address = read.url.to_string();
    let saved = tokio::task::spawn_blocking(move || page::save(&dir, &read, &sheets, shot.as_ref().map(|(b, e)| (b.clone(), *e))))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Hanzo could not save the site: {e}"))?;
    Ok(SiteSaved { title, url: address, files: saved.files, screenshot: saved.screenshot })
}

/// Serve `<dir>/redesign` on this computer, live: the same address while it runs, and the page reloads as the files change.
#[tauri::command]
pub async fn local_preview_start(dir: String) -> Result<Preview, String> {
    preview::start(&PathBuf::from(dir).join(BUILT)).await
}

/// Stop serving `<dir>/redesign`.
#[tauri::command]
pub async fn local_preview_stop(dir: String) -> Result<(), String> {
    preview::stop(&PathBuf::from(dir).join(BUILT));
    Ok(())
}

/// Show a preview in the person's browser: Chrome when it is installed, else the browser they use.
/// It opens a preview this app is serving and nothing else, so it is no way to open an address.
#[tauri::command]
pub async fn local_preview_open(url: String) -> Result<(), String> {
    url.strip_prefix("http://127.0.0.1:")
        .and_then(|rest| rest.split(['/', '?', '#']).next())
        .and_then(|p| p.parse::<u16>().ok())
        .filter(|p| preview::serving(*p))
        .ok_or("That preview is not running any more.")?;
    tokio::task::spawn_blocking(move || {
        if !chrome(&url) {
            opener::open_browser(&url).map_err(|e| format!("Hanzo could not open your browser: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Open `url` in Chrome; whether Chrome took it.
fn chrome(url: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Google Chrome", url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }
    #[cfg(target_os = "windows")]
    {
        ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
            .iter()
            .filter_map(|root| std::env::var_os(root))
            .map(|base| PathBuf::from(base).join("Google").join("Chrome").join("Application").join("chrome.exe"))
            .find(|exe| exe.is_file())
            .is_some_and(|exe| launch(Command::new(exe), url))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
            .iter()
            .find(|name| on_path(name))
            .is_some_and(|name| launch(Command::new(name), url))
    }
}

/// Start `command` on `url` and leave it running; whether it started. The child is reaped when it ends.
#[cfg(not(target_os = "macos"))]
fn launch(mut command: Command, url: &str) -> bool {
    match command.arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            true
        }
        Err(_) => false,
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn on_path(name: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::env::var_os("PATH").is_some_and(|paths| {
        std::env::split_paths(&paths).any(|dir| {
            dir.join(name).metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_name_is_made_of_letters_digits_and_dashes() {
        assert_eq!(slug("Example-Redesign"), "example-redesign");
        assert_eq!(slug("  blog.example  redesign "), "blog-example-redesign");
        assert_eq!(slug("../../etc/passwd"), "etc-passwd");
        assert_eq!(slug("日本語"), "site-redesign");
        assert_eq!(slug(""), "site-redesign");
        assert_eq!(slug(&"a".repeat(200)).len(), 60);
    }

    #[test]
    fn a_redesign_never_lands_in_a_folder_that_has_work_in_it() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("Hanzo");
        let first = free_folder(&base, "Example redesign");
        assert_eq!(first, base.join("example-redesign"));
        // Naming a folder makes nothing: a site that will not open leaves no folder behind.
        assert!(!base.exists());
        std::fs::create_dir_all(&first).unwrap();
        std::fs::write(first.join("mine.txt"), "x").unwrap();
        let second = free_folder(&base, "example-redesign");
        assert_eq!(second, base.join("example-redesign-2"));
        std::fs::create_dir_all(&second).unwrap();
        assert_eq!(free_folder(&base, "example-redesign"), base.join("example-redesign-3"));
        assert_eq!(std::fs::read_to_string(first.join("mine.txt")).unwrap(), "x");
    }

    #[tokio::test]
    async fn only_a_running_preview_is_opened() {
        for url in ["https://example.com/", "http://127.0.0.1:1/", "http://127.0.0.1:notaport/", "file:///etc/passwd", "http://localhost:80/"] {
            assert_eq!(local_preview_open(url.to_string()).await, Err("That preview is not running any more.".to_string()), "{url}");
        }
    }

    /// The whole of it against a site on this computer: capture it into a folder, serve the redesign, read it back over HTTP.
    /// No browser is paired, so the saved copy has no picture.
    #[tokio::test]
    async fn a_site_is_saved_and_a_redesign_of_it_is_served() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::{TcpListener, TcpStream};

        let _turn = preview::serial().lock().await;
        let site = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = site.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let (mut s, _) = site.accept().await.unwrap();
                let mut buf = vec![0u8; 4096];
                let n = s.read(&mut buf).await.unwrap();
                let path = String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("").split(' ').nth(1).unwrap_or("/").to_string();
                let (kind, body) = match path.as_str() {
                    "/s.css" => ("text/css", "h1{font-size:3rem}".to_string()),
                    _ => ("text/html", "<title>Old site</title><link rel=stylesheet href=\"/s.css\"><h1>Welcome</h1><p>We fix things.</p>".to_string()),
                };
                let _ = s
                    .write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes())
                    .await;
                let _ = s.shutdown().await;
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_string_lossy().into_owned();
        let saved = capture(&format!("127.0.0.1:{port}"), &folder, &page::Nobody).await.unwrap();
        assert!(!saved.screenshot);
        assert_eq!(saved.title, "Old site");
        assert_eq!(saved.url, format!("http://127.0.0.1:{port}/"));
        assert!(saved.files.starts_with(&["page.html".to_string(), "text.md".to_string(), "style-1.css".to_string()]), "{:?}", saved.files);
        let text = std::fs::read_to_string(dir.path().join(".hanzo/reference/text.md")).unwrap();
        assert!(text.contains("# Welcome") && text.contains("We fix things."), "{text}");

        // Nothing is saved for a folder that is not there, or an address that is never opened (the cloud metadata
        // address, typed or not; a private address the person types is opened, see fetch.rs).
        let file = dir.path().join("a-file");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(capture("example.com", &file.to_string_lossy(), &page::Nobody).await, Err("That is not a folder.".to_string()));
        assert!(capture("http://169.254.169.254/", &folder, &page::Nobody).await.is_err());

        // A site that will not open leaves no folder behind; one that does makes its own.
        let fresh = dir.path().join("Hanzo/new-site");
        assert!(capture("http://0.0.0.0/", &fresh.to_string_lossy(), &page::Nobody).await.is_err());
        assert!(!fresh.exists());
        capture(&format!("127.0.0.1:{port}"), &fresh.to_string_lossy(), &page::Nobody).await.unwrap();
        assert!(fresh.join(".hanzo/reference/text.md").is_file());

        // The agent's files are served as they land.
        let preview = local_preview_start(folder.clone()).await.unwrap();
        std::fs::write(dir.path().join("redesign/index.html"), "<body><h1>Fresh</h1></body>").unwrap();
        let mut s = TcpStream::connect(("127.0.0.1", preview.port)).await.unwrap();
        s.write_all(format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n", preview.port).as_bytes()).await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        assert!(out.contains("<h1>Fresh</h1>") && out.contains("/__hanzo/reload.js"), "{out}");
        local_preview_stop(folder).await.unwrap();
        assert!(!preview::serving(preview.port));
    }
}
