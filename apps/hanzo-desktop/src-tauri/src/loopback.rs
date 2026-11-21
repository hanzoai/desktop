//! The sign-in's way back: a loopback listener on a port the system picks
//! (RFC 8252 §7.3), as the Hanzo CLI binds one (`hanzo/cli` src/iam/oauth.rs).
//!
//! `hanzo://` is a scheme any installed app may claim, and Hanzo Dev claims it
//! too, so the browser's hand-back could open the wrong app, which holds no PKCE
//! verifier for the state. A loopback address answers only on this machine, and
//! only for the attempt that bound it. IAM's `hanzo-app` client registers the
//! portless `http://127.0.0.1/callback` and matches any port on it.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Url};

use crate::deep_links::OAuthDeepLinkPayload;
use crate::windows::{recreate_window, Window};

const PATH: &str = "/callback";
/// The event the Hanzo brand's sign-in listens for (`iam.callbackEvent`).
const EVENT: &str = "hanzo-iam-callback";
/// How long a sign-in may take before its port is closed.
const PATIENCE: Duration = Duration::from_secs(15 * 60);

const DONE: &str = "<!doctype html><meta charset=utf-8><title>Hanzo</title>\
<body style=\"font:16px system-ui;background:#050505;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0\">\
<p>You are signed in. Return to Hanzo.</p>";

/// Bind a port for one sign-in attempt and return it. The listener answers the
/// first callback that carries a state, then closes.
#[tauri::command]
pub fn iam_loopback(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("binding the sign-in callback: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let deadline = Instant::now() + PATIENCE;
        while Instant::now() < deadline {
            match listener.accept() {
                Ok((stream, _)) => {
                    if answer(&app, stream) {
                        return;
                    }
                }
                Err(_) => std::thread::sleep(Duration::from_millis(100)),
            }
        }
    });
    Ok(port)
}

/// Whether the connection was the callback.
fn answer(app: &AppHandle, mut stream: TcpStream) -> bool {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    let target = head.lines().next().and_then(|l| {
        let mut parts = l.split(' ');
        (parts.next() == Some("GET")).then(|| parts.next()).flatten()
    });
    let Some(payload) = target.and_then(callback) else {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return false;
    };
    let _ = recreate_window(app.clone(), Window::Main, true);
    let _ = app.emit(EVENT, payload);
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{DONE}",
        DONE.len()
    );
    true
}

/// The code and state a request target carries, when it is the callback's and
/// names a state.
fn callback(target: &str) -> Option<OAuthDeepLinkPayload> {
    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    if url.path() != PATH {
        return None;
    }
    let pair = |key: &str| {
        url.query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.to_string())
            .unwrap_or_default()
    };
    let state = pair("state");
    (!state.is_empty()).then(|| OAuthDeepLinkPayload { state, code: pair("code") })
}

#[cfg(test)]
mod tests {
    use super::callback;

    #[test]
    fn the_callback_hands_back_the_state_it_was_given() {
        let back = callback("/callback?code=c%2F1&state=s_-x").unwrap();
        assert_eq!((back.code.as_str(), back.state.as_str()), ("c/1", "s_-x"));
    }

    #[test]
    fn nothing_else_is_the_callback() {
        assert!(callback("/other?code=c&state=s").is_none());
        assert!(callback("/callback/../x").is_none());
        assert!(callback("/callback?code=c").is_none());
        assert!(callback("/favicon.ico").is_none());
    }
}
