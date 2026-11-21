//! A live preview of a folder on this computer.
//!
//! The agent writes a site as static files; this serves them on `127.0.0.1`, on a
//! port the system picks, so the person watches the design appear in their own
//! browser. Every page it serves carries a small script that listens on a
//! server-sent event stream (`/__hanzo/events`) and reloads when a file in the
//! folder is added, changed or removed, so the browser follows each run's work
//! without being asked.
//!
//! It serves GET and HEAD only, files under the folder only (a path that climbs,
//! carries a NUL or a backslash, or reaches outside through a link is refused),
//! and only to a request that names this server's own address in `Host`, so a
//! web page cannot reach it through a name it controls. Until the folder has an
//! `index.html` it answers with a page that says the design is being built, which
//! the same script swaps for the real one the moment it lands.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

/// What serves a folder.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Preview {
    /// The address to open: `http://127.0.0.1:<port>/`.
    pub url: String,
    pub port: u16,
}

struct Running {
    port: u16,
    stop: watch::Sender<bool>,
}

fn running() -> &'static Mutex<HashMap<PathBuf, Running>> {
    static RUNNING: OnceLock<Mutex<HashMap<PathBuf, Running>>> = OnceLock::new();
    RUNNING.get_or_init(Mutex::default)
}

/// The most files whose change is watched, and how deep.
const WATCHED: usize = 5000;
const DEPTH: usize = 16;

/// The longest a request's head may be, and how long it may take to arrive.
const HEAD: usize = 16 * 1024;
const HEAD_TIME: Duration = Duration::from_secs(10);

const SCRIPT: &str = "(function(){var s=new EventSource('/__hanzo/events');s.addEventListener('reload',function(){location.reload()})})();";
const TAG: &str = "<script src=\"/__hanzo/reload.js\"></script>";

const BUILDING: &str = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Building your new design</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#222;background:#fafafa}main{text-align:center;padding:24px}h1{font-size:22px;font-weight:600;margin:0 0 8px}p{margin:0;color:#666}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}p{color:#999}}</style></head><body><main><h1>Hanzo is building your new design</h1><p>This page changes by itself when it is ready.</p></main></body></html>";

const MISSING: &str = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Not found</title></head><body style=\"font:16px system-ui,sans-serif;padding:32px\"><h1 style=\"font-size:20px\">There is nothing here yet</h1><p>This page is not part of the design.</p></body></html>";

/// Start serving `<root>`, or answer the server already serving it. The folder is made if it is not there.
pub async fn start(root: &Path) -> Result<Preview, String> {
    std::fs::create_dir_all(root).map_err(|e| format!("Hanzo could not make the preview folder: {e}"))?;
    let root = std::fs::canonicalize(root).map_err(|e| format!("Hanzo could not open the preview folder: {e}"))?;
    if let Some(up) = running().lock().map_err(|_| "The preview is busy.".to_string())?.get(&root) {
        return Ok(address(up.port));
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| format!("Hanzo could not start the preview: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (stop, stopped) = watch::channel(false);
    {
        let mut all = running().lock().map_err(|_| "The preview is busy.".to_string())?;
        // Two starts racing: the first one in stays, and the other's listener is dropped unused.
        if let Some(up) = all.get(&root) {
            return Ok(address(up.port));
        }
        all.insert(root.clone(), Running { port, stop });
    }
    tokio::spawn(serve(listener, root, port, stopped));
    Ok(address(port))
}

fn address(port: u16) -> Preview {
    Preview { url: format!("http://127.0.0.1:{port}/"), port }
}

/// Stop serving `<root>`; whether it was being served.
pub fn stop(root: &Path) -> bool {
    let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let Ok(mut all) = running().lock() else { return false };
    match all.remove(&root) {
        Some(up) => {
            let _ = up.stop.send(true);
            true
        }
        None => false,
    }
}

/// Stop every preview: the window closed, or the app is leaving.
pub fn stop_all() {
    if let Ok(mut all) = running().lock() {
        for (_, up) in all.drain() {
            let _ = up.stop.send(true);
        }
    }
}

/// Whether `port` is a preview this app is serving: the only address it opens in a browser.
pub fn serving(port: u16) -> bool {
    running().lock().map_or(false, |all| all.values().any(|up| up.port == port))
}

struct Site {
    root: PathBuf,
    port: u16,
}

async fn serve(listener: TcpListener, root: PathBuf, port: u16, mut stopped: watch::Receiver<bool>) {
    let site = Arc::new(Site { root: root.clone(), port });
    let (changes, changed) = watch::channel(stamp(&root));
    let mut watching = stopped.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = watching.changed() => break,
                _ = tokio::time::sleep(Duration::from_millis(400)) => {
                    let at = root.clone();
                    if let Ok(now) = tokio::task::spawn_blocking(move || stamp(&at)).await {
                        changes.send_if_modified(|was| if *was == now { false } else { *was = now; true });
                    }
                }
            }
        }
    });
    loop {
        tokio::select! {
            _ = stopped.changed() => break,
            accepted = listener.accept() => {
                if let Ok((socket, _)) = accepted {
                    tokio::spawn(answer(socket, site.clone(), changed.clone(), stopped.clone()));
                }
            }
        }
    }
}

/// A fingerprint of what is in the folder: every file's place, size and modified time.
/// It changes when a file is added, changed or removed, and not otherwise.
pub fn stamp(root: &Path) -> u64 {
    let mut hasher = DefaultHasher::new();
    let mut seen = 0usize;
    let mut todo = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = todo.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        let mut names: Vec<_> = entries.filter_map(Result::ok).collect();
        names.sort_by_key(|e| e.file_name());
        for entry in names {
            seen += 1;
            if seen > WATCHED {
                return hasher.finish();
            }
            let Ok(meta) = entry.path().symlink_metadata() else { continue };
            entry.path().strip_prefix(root).unwrap_or(&entry.path()).hash(&mut hasher);
            meta.len().hash(&mut hasher);
            meta.modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .hash(&mut hasher);
            if meta.is_dir() && depth < DEPTH {
                todo.push((entry.path(), depth + 1));
            }
        }
    }
    hasher.finish()
}

struct Request {
    method: String,
    target: String,
    host: String,
}

fn parse(head: &str) -> Option<Request> {
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split(' ');
    let method = first.next()?.to_string();
    let target = first.next()?.to_string();
    if !first.next()?.starts_with("HTTP/1.") || first.next().is_some() {
        return None;
    }
    let host = lines
        .filter_map(|l| l.split_once(':'))
        .find(|(k, _)| k.eq_ignore_ascii_case("host"))
        .map(|(_, v)| v.trim().to_ascii_lowercase())
        .unwrap_or_default();
    Some(Request { method, target, host })
}

async fn read_head(socket: &mut TcpStream) -> Option<String> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    loop {
        let n = socket.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            return String::from_utf8(buf[..end].to_vec()).ok();
        }
        if buf.len() > HEAD {
            return None;
        }
    }
}

/// What a request resolves to.
#[derive(Debug, PartialEq)]
pub enum Route {
    Events,
    Script,
    File(PathBuf),
    /// A folder asked for without its closing slash: its own address, so its relative links resolve inside it.
    Slash(String),
    /// The folder has no `index.html` yet.
    Building,
    Missing,
    /// A path that climbs, hides a NUL or a backslash, or leaves the folder.
    Refused,
}

/// A request target's path, percent-decoded; None when the encoding is not valid UTF-8.
fn decode(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = path.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Where a request for `target` goes, under `root` (already canonical).
pub fn route(root: &Path, target: &str) -> Route {
    let path = target.split(['?', '#']).next().unwrap_or("");
    if !path.starts_with('/') {
        return Route::Refused;
    }
    match path {
        "/__hanzo/events" => return Route::Events,
        "/__hanzo/reload.js" => return Route::Script,
        _ => {}
    }
    let Some(path) = decode(path) else { return Route::Refused };
    if path.contains(['\0', '\\']) {
        return Route::Refused;
    }
    let mut at = root.to_path_buf();
    for part in path.split('/').filter(|p| !p.is_empty() && *p != ".") {
        if part == ".." {
            return Route::Refused;
        }
        at.push(part);
    }
    if at != root && !path.ends_with('/') && at.is_dir() && std::fs::canonicalize(&at).is_ok_and(|real| real.starts_with(root)) {
        return Route::Slash(format!("{}/", target.split(['?', '#']).next().unwrap_or("")));
    }
    let candidate = if path.ends_with('/') || at == root { at.join("index.html") } else { at };
    match std::fs::canonicalize(&candidate) {
        Ok(real) if real.starts_with(root) && real.is_file() => Route::File(real),
        Ok(real) if !real.starts_with(root) => Route::Refused,
        _ if candidate == root.join("index.html") => Route::Building,
        _ => Route::Missing,
    }
}

/// The type a file is served as.
fn kind(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("json" | "map") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("txt" | "md") => "text/plain; charset=utf-8",
        Some("xml") => "application/xml; charset=utf-8",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("pdf") => "application/pdf",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

/// `html` with the reload script before its last `</body>`, or at its end.
pub fn inject(html: &[u8]) -> Vec<u8> {
    let lower: Vec<u8> = html.iter().map(u8::to_ascii_lowercase).collect();
    let at = lower.windows(7).rposition(|w| w == b"</body>").unwrap_or(html.len());
    let mut out = Vec::with_capacity(html.len() + TAG.len());
    out.extend_from_slice(&html[..at]);
    out.extend_from_slice(TAG.as_bytes());
    out.extend_from_slice(&html[at..]);
    out
}

async fn say(socket: &mut TcpStream, status: u16, reason: &str, kind: &str, body: &[u8], head_only: bool) {
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = socket.write_all(head.as_bytes()).await;
    if !head_only {
        let _ = socket.write_all(body).await;
    }
    let _ = socket.shutdown().await;
}

async fn answer(mut socket: TcpStream, site: Arc<Site>, mut changed: watch::Receiver<u64>, mut stopped: watch::Receiver<bool>) {
    let Ok(Some(head)) = tokio::time::timeout(HEAD_TIME, read_head(&mut socket)).await else { return };
    let Some(request) = parse(&head) else {
        return say(&mut socket, 400, "Bad Request", "text/plain; charset=utf-8", b"Bad request", false).await;
    };
    let own = [format!("127.0.0.1:{}", site.port), format!("localhost:{}", site.port)];
    if !own.contains(&request.host) {
        return say(&mut socket, 421, "Misdirected Request", "text/plain; charset=utf-8", b"This preview answers only at its own address", false).await;
    }
    let head_only = request.method == "HEAD";
    if request.method != "GET" && !head_only {
        return say(&mut socket, 405, "Method Not Allowed", "text/plain; charset=utf-8", b"Method not allowed", false).await;
    }
    match route(&site.root, &request.target) {
        Route::Refused => say(&mut socket, 403, "Forbidden", "text/plain; charset=utf-8", b"Forbidden", head_only).await,
        Route::Script => say(&mut socket, 200, "OK", "text/javascript; charset=utf-8", SCRIPT.as_bytes(), head_only).await,
        Route::Slash(to) => {
            let head = format!("HTTP/1.1 301 Moved Permanently\r\nLocation: {to}\r\nContent-Length: 0\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
            let _ = socket.write_all(head.as_bytes()).await;
            let _ = socket.shutdown().await;
        }
        Route::Building => say(&mut socket, 200, "OK", "text/html; charset=utf-8", &inject(BUILDING.as_bytes()), head_only).await,
        Route::Missing => say(&mut socket, 404, "Not Found", "text/html; charset=utf-8", &inject(MISSING.as_bytes()), head_only).await,
        Route::File(path) => match tokio::fs::read(&path).await {
            Ok(bytes) => {
                let kind = kind(&path);
                let body = if kind.starts_with("text/html") { inject(&bytes) } else { bytes };
                say(&mut socket, 200, "OK", kind, &body, head_only).await
            }
            Err(_) => say(&mut socket, 404, "Not Found", "text/html; charset=utf-8", &inject(MISSING.as_bytes()), head_only).await,
        },
        Route::Events => {
            // What changes from here on is what this connection reports, so it is marked before the client hears it opened.
            changed.mark_unchanged();
            let opened = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\nretry: 1000\n\n";
            if socket.write_all(opened.as_bytes()).await.is_err() {
                return;
            }
            loop {
                let line: &[u8] = tokio::select! {
                    _ = stopped.changed() => return,
                    c = changed.changed() => {
                        if c.is_err() {
                            return;
                        }
                        b"event: reload\ndata: changed\n\n"
                    }
                    _ = tokio::time::sleep(Duration::from_secs(15)) => b": still here\n\n",
                };
                if socket.write_all(line).await.is_err() {
                    return;
                }
            }
        }
    }
}

/// The registry is the process's, so the tests that start servers (and the one that stops them all) take turns.
#[cfg(test)]
pub(super) fn serial() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(Default::default)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One raw request, answered in full (the server closes each connection).
    async fn ask(port: u16, request: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(request.as_bytes()).await.unwrap();
        let mut out = Vec::new();
        tokio::time::timeout(Duration::from_secs(5), s.read_to_end(&mut out)).await.unwrap().unwrap();
        String::from_utf8_lossy(&out).into_owned()
    }

    fn get(port: u16, path: &str) -> String {
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n")
    }

    fn body(response: &str) -> &str {
        response.split_once("\r\n\r\n").map_or("", |(_, b)| b)
    }

    fn status(response: &str) -> &str {
        response.lines().next().unwrap_or("")
    }

    #[test]
    fn paths_stay_inside_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        std::fs::write(root.join("index.html"), "<p>hi</p>").unwrap();
        std::fs::create_dir_all(root.join("css")).unwrap();
        std::fs::write(root.join("css/a.css"), "a{}").unwrap();
        std::fs::create_dir_all(root.join("blog")).unwrap();
        std::fs::write(root.join("blog/index.html"), "<p>blog</p>").unwrap();
        std::fs::write(root.join("a b.txt"), "x").unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "secret").unwrap();

        assert_eq!(route(&root, "/"), Route::File(root.join("index.html")));
        assert_eq!(route(&root, "/index.html?x=1#y"), Route::File(root.join("index.html")));
        assert_eq!(route(&root, "/css/a.css"), Route::File(root.join("css/a.css")));
        assert_eq!(route(&root, "/blog"), Route::Slash("/blog/".into()));
        assert_eq!(route(&root, "/blog?a=1"), Route::Slash("/blog/".into()));
        assert_eq!(route(&root, "/blog/"), Route::File(root.join("blog/index.html")));
        assert_eq!(route(&root, "/a%20b.txt"), Route::File(root.join("a b.txt")));
        assert_eq!(route(&root, "/nope.css"), Route::Missing);
        assert_eq!(route(&root, "/__hanzo/events"), Route::Events);
        assert_eq!(route(&root, "/__hanzo/reload.js"), Route::Script);

        for bad in [
            "/../x",
            "/css/../../x",
            "/%2e%2e/x",
            "/%2E%2E%2Fsecret",
            "/css/..%2f..%2fx",
            "/a\\b",
            "/a%5Cb",
            "/a%00b",
            "/%ff",
            "/%zz",
            "/%2",
            "*",
            "http://evil/x",
        ] {
            assert_eq!(route(&root, bad), Route::Refused, "{bad}");
        }

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside.path().join("secret.txt"), root.join("link.txt")).unwrap();
            std::os::unix::fs::symlink(outside.path(), root.join("out")).unwrap();
            assert_eq!(route(&root, "/link.txt"), Route::Refused);
            assert_eq!(route(&root, "/out/secret.txt"), Route::Refused);
        }
    }

    #[test]
    fn an_empty_folder_is_building_and_other_paths_are_missing() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        assert_eq!(route(&root, "/"), Route::Building);
        assert_eq!(route(&root, "/index.html"), Route::Building);
        assert_eq!(route(&root, "/about.html"), Route::Missing);
    }

    #[test]
    fn the_script_goes_before_the_last_body_end() {
        let out = String::from_utf8(inject(b"<html><body><p>a</p></BODY></html>")).unwrap();
        assert_eq!(out, format!("<html><body><p>a</p>{TAG}</BODY></html>"));
        let bare = String::from_utf8(inject(b"<p>a</p>")).unwrap();
        assert_eq!(bare, format!("<p>a</p>{TAG}"));
        let two = String::from_utf8(inject(b"<body>x</body><!-- </body> --></html>")).unwrap();
        assert_eq!(two, format!("<body>x</body><!-- {TAG}</body> --></html>"));
    }

    #[test]
    fn the_stamp_follows_the_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let empty = stamp(root);
        std::fs::write(root.join("index.html"), "a").unwrap();
        let one = stamp(root);
        assert_ne!(empty, one);
        assert_eq!(one, stamp(root));
        std::fs::write(root.join("index.html"), "ab").unwrap();
        assert_ne!(one, stamp(root));
        std::fs::create_dir_all(root.join("img")).unwrap();
        std::fs::write(root.join("img/a.png"), "x").unwrap();
        let three = stamp(root);
        std::fs::remove_file(root.join("img/a.png")).unwrap();
        assert_ne!(three, stamp(root));
    }

    #[tokio::test]
    async fn serves_the_folder_and_follows_it() {
        let _turn = serial().lock().await;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("redesign");
        let preview = start(&root).await.unwrap();
        assert!(preview.url.starts_with("http://127.0.0.1:") && preview.url.ends_with('/'));
        assert!(serving(preview.port));
        // The same folder is the same server.
        assert_eq!(start(&root).await.unwrap(), preview);
        let port = preview.port;

        // Nothing built yet: the page says so, and carries the script that will swap it.
        let first = ask(port, &get(port, "/")).await;
        assert!(status(&first).contains("200"), "{first}");
        assert!(body(&first).contains("Hanzo is building your new design"));
        assert!(body(&first).contains(TAG));

        // A live reload connection, opened before the design lands.
        let mut events = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        events.write_all(get(port, "/__hanzo/events").as_bytes()).await.unwrap();
        let mut seen = Vec::new();
        let mut buf = [0u8; 512];
        while !String::from_utf8_lossy(&seen).contains("retry:") {
            let n = tokio::time::timeout(Duration::from_secs(5), events.read(&mut buf)).await.unwrap().unwrap();
            assert!(n > 0);
            seen.extend_from_slice(&buf[..n]);
        }
        assert!(String::from_utf8_lossy(&seen).contains("text/event-stream"));

        // The agent writes its files.
        std::fs::write(root.join("index.html"), "<html><body><h1>New</h1></body></html>").unwrap();
        std::fs::write(root.join("site.css"), "h1{color:teal}").unwrap();
        let mut got = String::new();
        let started = std::time::Instant::now();
        while !got.contains("event: reload") {
            assert!(started.elapsed() < Duration::from_secs(5), "no reload arrived: {got:?}");
            let n = tokio::time::timeout(Duration::from_secs(5), events.read(&mut buf)).await.unwrap().unwrap();
            assert!(n > 0);
            got.push_str(&String::from_utf8_lossy(&buf[..n]));
        }

        let page = ask(port, &get(port, "/")).await;
        assert!(body(&page).contains("<h1>New</h1>") && body(&page).contains(TAG), "{page}");
        assert!(page.contains("Cache-Control: no-store"));
        let css = ask(port, &get(port, "/site.css")).await;
        assert!(css.contains("Content-Type: text/css") && body(&css) == "h1{color:teal}", "{css}");
        let script = ask(port, &get(port, "/__hanzo/reload.js")).await;
        assert!(body(&script).contains("EventSource('/__hanzo/events')"));
        let head = ask(port, &format!("HEAD / HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n")).await;
        assert!(status(&head).contains("200") && body(&head).is_empty(), "{head}");
        let missing = ask(port, &get(port, "/nope")).await;
        assert!(status(&missing).contains("404"));

        // Stopped, it stops answering, and its port is no longer one the app opens.
        assert!(stop(&root));
        assert!(!serving(port));
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(TcpStream::connect(("127.0.0.1", port)).await.is_err());
        assert!(!stop(&root));
    }

    #[tokio::test]
    async fn refuses_what_it_should() {
        let _turn = serial().lock().await;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("redesign");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(dir.path().join("secret.txt"), "secret").unwrap();
        let preview = start(&root).await.unwrap();
        let port = preview.port;

        // A climbing path, sent as the browser would never send it.
        let up = ask(port, &get(port, "/../secret.txt")).await;
        assert!(status(&up).contains("403") && !up.contains("secret\r\n") && body(&up) == "Forbidden", "{up}");
        let encoded = ask(port, &get(port, "/%2e%2e/secret.txt")).await;
        assert!(status(&encoded).contains("403"), "{encoded}");

        // A name the page controls pointing at this port is not this server's own address.
        let rebound = ask(port, &format!("GET / HTTP/1.1\r\nHost: evil.example:{port}\r\n\r\n")).await;
        assert!(status(&rebound).contains("421"), "{rebound}");
        let none = ask(port, "GET / HTTP/1.1\r\n\r\n").await;
        assert!(status(&none).contains("421"), "{none}");

        let post = ask(port, &format!("POST / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\n\r\n")).await;
        assert!(status(&post).contains("405"), "{post}");
        let junk = ask(port, "nonsense\r\n\r\n").await;
        assert!(status(&junk).contains("400"), "{junk}");

        stop(&root);
    }

    #[tokio::test]
    async fn stop_all_stops_every_preview() {
        let _turn = serial().lock().await;
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let pa = start(&a.path().join("redesign")).await.unwrap();
        let pb = start(&b.path().join("redesign")).await.unwrap();
        assert_ne!(pa.port, pb.port);
        assert!(serving(pa.port) && serving(pb.port));
        stop_all();
        assert!(!serving(pa.port) && !serving(pb.port));
    }
}
