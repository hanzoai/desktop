//! The sign-in's way back: a listener on the loopback interface (RFC 8252 §7.3).
//!
//! `hanzo://` is a scheme any installed app may claim, and Hanzo Dev claims it
//! too, so the browser's hand-back could open the wrong app, which holds no
//! PKCE verifier for the state. A loopback address only this machine's one
//! listener can answer. IAM registers it for `hanzo-app` and hanzo.ai's page
//! hands the code to it directly (hanzo-inc/app `loopback`).

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Url};

use crate::deep_links::OAuthDeepLinkPayload;
use crate::windows::{recreate_window, Window};

/// The port and path of `iam.redirectUri` in libs/brand-config.
const PORT: u16 = 1455;
const PATH: &str = "/auth/callback";
/// The event the Hanzo brand's sign-in listens for (`iam.callbackEvent`).
const EVENT: &str = "hanzo-iam-callback";

const DONE: &str = "<!doctype html><meta charset=utf-8><title>Hanzo</title>\
<body style=\"font:16px system-ui;background:#050505;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0\">\
<p>You are signed in. Return to Hanzo.</p>";

pub fn serve(app: &AppHandle) {
    let listener = match TcpListener::bind(("127.0.0.1", PORT)) {
        Ok(listener) => listener,
        Err(e) => {
            log::error!("sign-in listener cannot bind 127.0.0.1:{PORT}: {e}");
            return;
        }
    };
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            answer(&app, stream);
        }
    });
}

fn answer(app: &AppHandle, mut stream: TcpStream) {
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
        return;
    };
    let _ = recreate_window(app.clone(), Window::Main, true);
    let _ = app.emit(EVENT, payload);
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{DONE}",
        DONE.len()
    );
}

/// The code and state a request target carries, when it is the callback's.
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
    Some(OAuthDeepLinkPayload { state: pair("state"), code: pair("code") })
}

#[cfg(test)]
mod tests {
    use super::callback;

    #[test]
    fn the_callback_hands_back_the_state_it_was_given() {
        let back = callback("/auth/callback?code=c%2F1&state=s_-x").unwrap();
        assert_eq!((back.code.as_str(), back.state.as_str()), ("c/1", "s_-x"));
    }

    #[test]
    fn nothing_else_is_the_callback() {
        assert!(callback("/other?code=c&state=s").is_none());
        assert!(callback("/auth/callback/../x").is_none());
    }
}
