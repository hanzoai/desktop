//! The user's real browser, through the Hanzo extension on this user's ZAP
//! router — the path hanzo-mcp's `browser` tool takes.
//!
//! `main` calls `zapd::embed()`, so Desktop stands for router beside every
//! hanzo-mcp process and the browser answers whether or not one runs. The
//! extension registers as `browser/<host>/<engine>-<id>`. A command is a method
//! (`hanzo.snapshot`, `hanzo.act`, `Page.navigate`, …) and string params; the
//! answer is UTF-8 JSON text, or `ERR:<why>` when the browser refused.

use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

const BROWSER: &str = "browser/";

const UNPAIRED: &str =
    "no browser on the ZAP router: open Chrome with the Hanzo extension; it joins on its own";

#[derive(Serialize, Debug, PartialEq)]
pub struct Browser {
    pub id: String,
    pub caps: Vec<String>,
    pub attrs: BTreeMap<String, String>,
}

/// This process's seat on the router, taken on first use.
fn node() -> &'static zapd::Node {
    static NODE: OnceLock<zapd::Node> = OnceLock::new();
    NODE.get_or_init(|| {
        zapd::Node::join(
            &format!("desktop/{}", std::process::id()),
            zapd::frame::ROLE_CONSUMER,
            "",
            &[],
        )
    })
}

/// The browsers registered on this user's router.
#[tauri::command]
pub async fn browsers() -> Result<Vec<Browser>, String> {
    let nodes = node()
        .nodes(Duration::from_secs(2))
        .await
        .map_err(|e| e.to_string())?;
    Ok(nodes
        .into_iter()
        .filter(|n| n.id.starts_with(BROWSER))
        .map(|n| Browser {
            id: n.id,
            caps: n.desc.caps,
            attrs: n.desc.attrs.into_iter().collect(),
        })
        .collect())
}

/// Run `method` with `params` on the first registered browser.
#[tauri::command]
pub async fn browser(method: String, params: HashMap<String, String>) -> Result<Value, String> {
    let to = browsers().await?.into_iter().next().ok_or(UNPAIRED)?.id;
    let raw = node()
        .call(&to, encode(&method, &params), Duration::from_secs(30))
        .await
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&raw);
    if let Some(why) = text.strip_prefix("ERR:") {
        return Err(why.to_string());
    }
    Ok(serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.into_owned())))
}

/// The command body the extension's `decodeCmd` reads, little-endian:
/// method (u16 len + bytes), u16 param count, then each param as key
/// (u16 len + bytes) and value (u32 len + bytes).
fn encode(method: &str, params: &HashMap<String, String>) -> Vec<u8> {
    let mut b = Vec::new();
    put(&mut b, method);
    b.extend_from_slice(&(params.len() as u16).to_le_bytes());
    for (k, v) in params {
        put(&mut b, k);
        b.extend_from_slice(&(v.len() as u32).to_le_bytes());
        b.extend_from_slice(v.as_bytes());
    }
    b
}

fn put(b: &mut Vec<u8>, s: &str) {
    b.extend_from_slice(&(s.len() as u16).to_le_bytes());
    b.extend_from_slice(s.as_bytes());
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};

    use tokio::io::AsyncWriteExt;
    use tokio::net::UnixStream;
    use zapd::frame::{self, Frame};

    use super::*;

    /// A router under a temp runtime dir, a fake `browser/` provider on it, and
    /// the commands routed to it. The pairing is pre-written with a port the
    /// extension never sweeps, so nothing here reaches the live router.
    #[tokio::test]
    async fn routes_to_a_registered_browser() {
        let home = tempfile::tempdir().unwrap();
        let state = home.path().join("state");
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(state.join("zap"))
            .unwrap();
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let pairing = zapd::pair::Pairing { port, key: [7; 32] };
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(state.join("zap/pair"))
            .unwrap()
            .write_all(pairing.code().as_bytes())
            .unwrap();
        std::env::set_var("XDG_RUNTIME_DIR", home.path().join("run"));
        std::env::set_var("XDG_STATE_HOME", &state);
        zapd::embed();

        assert_eq!(
            browser("hanzo.url".into(), HashMap::new()).await,
            Err(UNPAIRED.into())
        );

        // The fake browser: register, then answer each ROUTE the way the
        // extension does — JSON text, or ERR: for a method it refuses.
        let mut s = loop {
            match UnixStream::connect(zapd::socket_path()).await {
                Ok(s) => break s,
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        };
        let hello = frame::Descriptor {
            role: frame::ROLE_PROVIDER,
            brand: "hanzo".into(),
            caps: vec!["browser.dom".into()],
            attrs: vec![("engine".into(), "chrome".into())],
        };
        s.write_all(
            &Frame::new(
                frame::HELLO,
                "browser/chrome-test",
                "",
                frame::encode_hello(&hello),
            )
            .encode(),
        )
        .await
        .unwrap();
        let (mut rd, mut wr) = s.into_split();
        let welcome = Frame::read(&mut rd).await.unwrap().unwrap();
        assert_eq!(welcome.typ, frame::WELCOME);
        let id = welcome.to;
        let want =
            b"\x0e\x00hanzo.snapshot\x01\x00\x0b\x00interactive\x04\x00\x00\x00true".to_vec();
        tokio::spawn(async move {
            while let Some(f) = Frame::read(&mut rd).await.unwrap() {
                if f.typ != frame::ROUTE {
                    continue;
                }
                let out: &[u8] = if f.payload == want {
                    br#"{"tree":"- button \"Sign in\" [ref=e2]"}"#
                } else {
                    b"ERR:unknown method"
                };
                wr.write_all(&Frame::new(frame::RESPONSE, "", &f.from, out.to_vec()).encode())
                    .await
                    .unwrap();
            }
        });

        assert_eq!(
            browsers().await.unwrap(),
            vec![Browser {
                id: id.clone(),
                caps: vec!["browser.dom".into()],
                attrs: [("engine".to_string(), "chrome".to_string())].into(),
            }]
        );
        assert!(
            id.starts_with(BROWSER) && id.ends_with("/chrome-test"),
            "{id}"
        );

        let params = HashMap::from([("interactive".to_string(), "true".to_string())]);
        assert_eq!(
            browser("hanzo.snapshot".into(), params).await,
            Ok(serde_json::json!({"tree": "- button \"Sign in\" [ref=e2]"}))
        );
        assert_eq!(
            browser("hanzo.nothing".into(), HashMap::new()).await,
            Err("unknown method".into())
        );
    }
}
