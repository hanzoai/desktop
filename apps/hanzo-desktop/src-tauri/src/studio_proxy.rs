//! The `hanzo-studio` scheme: Studio's engine, reached from the window.
//!
//! Studio (@hanzo/studio, drawn by hanzo.ai's app in the main window) calls its
//! engine at studio.hanzo.ai for GPU status, the library, documents and uploads.
//! That server's CORS admits https://hanzo.ai and nothing else, so a fetch from
//! the window's own origin (tauri://localhost on macOS and Linux,
//! http://tauri.localhost on Windows) is refused before it is sent. This scheme
//! takes those calls inside the app and forwards them natively, where CORS does
//! not apply:
//!
//! ```text
//! hanzo-studio://localhost/v1/gpu-status        (macOS, Linux)
//! http://hanzo-studio.localhost/v1/gpu-status   (Windows)
//!   -> https://studio.hanzo.ai/v1/gpu-status
//! ```
//!
//! The patched `engineFrom` (patches/@hanzo__studio@0.1.8.patch) points Studio
//! here. It forwards to one origin only (HANZO_STUDIO_URL, as the GPU-fleet
//! worker reads it), under /v1/ only, with only the headers Studio sends its
//! engine, and it adds no credentials of its own: the bearer token is the one
//! Studio already put on the request.

use std::sync::OnceLock;
use std::time::Duration;

use tauri::http::{header, Method, Request, Response, StatusCode, Uri};

/// The scheme the window reaches Studio's engine at.
pub const SCHEME: &str = "hanzo-studio";

const DEFAULT_STUDIO_URL: &str = "https://studio.hanzo.ai";

/// The window's own origins. Nothing else is answered with CORS headers.
const WINDOW_ORIGINS: [&str; 3] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];

/// Request headers Studio sends its engine. Nothing else crosses (no cookies).
const FORWARD: [&str; 5] = ["authorization", "x-org-id", "x-target-gpu", "content-type", "accept"];

/// Response headers Studio reads back.
const RETURN: [&str; 2] = ["content-type", "content-disposition"];

/// The engine's origin: HANZO_STUDIO_URL, else studio.hanzo.ai.
fn upstream() -> String {
    std::env::var("HANZO_STUDIO_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_STUDIO_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // A redirect is the engine's answer (a 302 to sign-in), not somewhere
            // to carry the bearer token.
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// The engine URL a request to the scheme stands for, or None when it is not
/// one of the engine's /v1/ paths (a `..` segment would climb out of /v1/ once
/// the URL is normalised, so none is taken).
fn target(base: &str, uri: &Uri) -> Option<String> {
    let pq = uri.path_and_query()?;
    let path = pq.path();
    if !path.starts_with("/v1/") {
        return None;
    }
    let climbs = path
        .split('/')
        .map(|s| s.to_ascii_lowercase().replace("%2e", "."))
        .any(|s| s == "." || s == "..");
    if climbs {
        return None;
    }
    Some(format!("{base}{pq}"))
}

/// The request's Origin, when it is the window's.
fn window_origin<B>(req: &Request<B>) -> Option<String> {
    let origin = req.headers().get(header::ORIGIN)?.to_str().ok()?;
    WINDOW_ORIGINS.contains(&origin).then(|| origin.to_string())
}

fn with_cors(b: tauri::http::response::Builder, origin: Option<&str>) -> tauri::http::response::Builder {
    let Some(origin) = origin else { return b };
    b.header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
        .header(header::VARY, "Origin")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        .header(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            "Authorization, Content-Type, Accept, X-Org-Id, X-Target-GPU",
        )
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Disposition")
        .header(header::ACCESS_CONTROL_MAX_AGE, "86400")
}

/// A refusal in the shape Studio reads (`{error: {message}}`).
fn refuse(status: StatusCode, origin: Option<&str>, message: &str) -> Response<Vec<u8>> {
    let body = serde_json::json!({ "error": { "message": message } }).to_string();
    with_cors(Response::builder().status(status), origin)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.into_bytes())
        .unwrap_or_else(|_| bare(StatusCode::BAD_GATEWAY))
}

fn bare(status: StatusCode) -> Response<Vec<u8>> {
    let mut r = Response::new(Vec::new());
    *r.status_mut() = status;
    r
}

/// Answer one request to the scheme by asking the engine at `base`.
async fn answer(req: Request<Vec<u8>>, base: &str) -> Response<Vec<u8>> {
    let origin = window_origin(&req);
    let origin = origin.as_deref();
    if req.method() == Method::OPTIONS {
        return with_cors(Response::builder().status(StatusCode::NO_CONTENT), origin)
            .body(Vec::new())
            .unwrap_or_else(|_| bare(StatusCode::NO_CONTENT));
    }
    let Some(url) = target(base, req.uri()) else {
        return refuse(StatusCode::NOT_FOUND, origin, "Studio's engine answers /v1/ paths only.");
    };
    let Ok(method) = reqwest::Method::from_bytes(req.method().as_str().as_bytes()) else {
        return refuse(StatusCode::METHOD_NOT_ALLOWED, origin, "Studio's engine does not take that method.");
    };
    let mut out = client().request(method, &url);
    for name in FORWARD {
        if let Some(v) = req.headers().get(name) {
            out = out.header(name, v.as_bytes());
        }
    }
    let body = req.into_body();
    if !body.is_empty() {
        out = out.body(body);
    }
    let res = match out.send().await {
        Ok(res) => res,
        Err(e) => {
            log::warn!("studio proxy: {url} unreachable: {e}");
            return refuse(StatusCode::BAD_GATEWAY, origin, &format!("Studio's engine could not be reached: {e}"));
        }
    };
    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let kept: Vec<(&str, Vec<u8>)> = RETURN
        .iter()
        .filter_map(|n| res.headers().get(*n).map(|v| (*n, v.as_bytes().to_vec())))
        .collect();
    let bytes = match res.bytes().await {
        Ok(b) => b.to_vec(),
        Err(e) => {
            return refuse(StatusCode::BAD_GATEWAY, origin, &format!("Studio's engine broke off its answer: {e}"));
        }
    };
    let mut b = with_cors(Response::builder().status(status), origin);
    for (name, value) in kept {
        b = b.header(name, value);
    }
    b.body(bytes).unwrap_or_else(|_| bare(StatusCode::BAD_GATEWAY))
}

/// The scheme's handler (registered in main.rs).
pub fn handle<R: tauri::Runtime>(
    _ctx: tauri::UriSchemeContext<'_, R>,
    req: Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let base = upstream();
    tauri::async_runtime::spawn(async move {
        responder.respond(answer(req, &base).await);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn uri(s: &str) -> Uri {
        s.parse().unwrap()
    }

    #[test]
    fn engine_paths_map_to_the_engine_on_every_platform() {
        let base = "https://studio.hanzo.ai";
        assert_eq!(
            target(base, &uri("hanzo-studio://localhost/v1/gpu-status")).as_deref(),
            Some("https://studio.hanzo.ai/v1/gpu-status")
        );
        assert_eq!(
            target(base, &uri("http://hanzo-studio.localhost/v1/library/file?path=a%2Fb.png")).as_deref(),
            Some("https://studio.hanzo.ai/v1/library/file?path=a%2Fb.png")
        );
    }

    #[test]
    fn nothing_outside_v1_is_forwarded() {
        let base = "https://studio.hanzo.ai";
        for u in [
            "hanzo-studio://localhost/",
            "hanzo-studio://localhost/prompt",
            "hanzo-studio://localhost/v1",
            "hanzo-studio://localhost/v1/../admin",
            "hanzo-studio://localhost/v1/%2e%2e/admin",
            "hanzo-studio://localhost/v1/%2E./admin",
            "hanzo-studio://localhost/v1/./x",
        ] {
            assert_eq!(target(base, &uri(u)), None, "{u}");
        }
    }

    #[test]
    fn only_the_window_is_answered_with_cors() {
        let ask = |o: &str| Request::builder().header("origin", o).body(()).unwrap();
        assert_eq!(window_origin(&ask("tauri://localhost")).as_deref(), Some("tauri://localhost"));
        assert_eq!(window_origin(&ask("http://tauri.localhost")).as_deref(), Some("http://tauri.localhost"));
        assert_eq!(window_origin(&ask("https://evil.example")), None);
        assert_eq!(window_origin(&Request::builder().body(()).unwrap()), None);
    }

    #[tokio::test]
    async fn a_preflight_is_answered_here() {
        let req = Request::builder()
            .method("OPTIONS")
            .uri("hanzo-studio://localhost/v1/gpu-status")
            .header("origin", "tauri://localhost")
            .body(Vec::new())
            .unwrap();
        // An unroutable base: a preflight must never leave the app.
        let res = answer(req, "http://127.0.0.1:1").await;
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(res.headers()["access-control-allow-origin"], "tauri://localhost");
        assert!(res.headers()["access-control-allow-headers"].to_str().unwrap().contains("Authorization"));
    }

    #[tokio::test]
    async fn an_unreachable_engine_is_a_refusal_studio_can_read() {
        let req = Request::builder()
            .uri("hanzo-studio://localhost/v1/gpu-status")
            .header("origin", "tauri://localhost")
            .body(Vec::new())
            .unwrap();
        let res = answer(req, "http://127.0.0.1:1").await;
        assert_eq!(res.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(res.headers()["access-control-allow-origin"], "tauri://localhost");
        let body: serde_json::Value = serde_json::from_slice(res.body()).unwrap();
        assert!(body["error"]["message"].as_str().unwrap().starts_with("Studio's engine could not be reached"));
    }

    /// One canned HTTP answer (status line and headers, then body) on a local
    /// port; hands back what it was asked.
    fn engine_once(head: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        let reply = format!("{head}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = vec![0u8; 16 * 1024];
            let mut got = Vec::new();
            loop {
                let n = s.read(&mut buf).unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got).to_string();
                if let Some(end) = text.find("\r\n\r\n") {
                    let len = text[..end]
                        .lines()
                        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                        .unwrap_or(0);
                    if got.len() >= end + 4 + len {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            s.write_all(reply.as_bytes()).unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (base, seen)
    }

    #[tokio::test]
    async fn a_call_reaches_the_engine_with_studios_headers_and_body_only() {
        let (base, seen) = engine_once(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nset-cookie: s=1",
            r#"{"state":"ready","online":1,"total":1,"nodes":[]}"#,
        );
        let req = Request::builder()
            .method("POST")
            .uri("hanzo-studio://localhost/v1/documents?x=1")
            .header("origin", "tauri://localhost")
            .header("authorization", "Bearer t")
            .header("x-org-id", "org")
            .header("content-type", "application/json")
            .header("cookie", "session=secret")
            .body(b"{\"a\":1}".to_vec())
            .unwrap();
        let res = answer(req, &base).await;
        let asked = seen.join().unwrap();
        assert!(asked.starts_with("POST /v1/documents?x=1 HTTP/1.1"), "{asked}");
        let lower = asked.to_ascii_lowercase();
        assert!(lower.contains("authorization: bearer t"));
        assert!(lower.contains("x-org-id: org"));
        assert!(!lower.contains("cookie"), "no cookie crosses: {asked}");
        assert!(asked.ends_with("{\"a\":1}"));
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers()["content-type"], "application/json");
        assert_eq!(res.headers()["access-control-allow-origin"], "tauri://localhost");
        assert!(res.headers().get("set-cookie").is_none());
        let fleet: serde_json::Value = serde_json::from_slice(res.body()).unwrap();
        assert!(fleet["nodes"].is_array());
    }

    #[tokio::test]
    async fn a_redirect_is_handed_back_not_followed() {
        let (base, seen) = engine_once("HTTP/1.1 302 Found\r\nlocation: https://hanzo.id/login", "");
        let req = Request::builder()
            .uri("hanzo-studio://localhost/v1/gpu-status")
            .header("origin", "tauri://localhost")
            .body(Vec::new())
            .unwrap();
        let res = answer(req, &base).await;
        seen.join().unwrap();
        assert_eq!(res.status(), StatusCode::FOUND);
    }
}
