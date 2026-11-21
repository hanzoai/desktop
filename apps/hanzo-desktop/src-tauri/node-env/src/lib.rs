//! The embeddings env the desktop spawns `hanzo-node` with, and the Hanzo key
//! in it (cloud#760).
//!
//! The node embeds its built-in tools, imported tools and file chunks by
//! calling `EMBEDDINGS_SERVER_URL`. Up to v1.19.3 it spoke only Ollama's
//! `POST {url}/api/embeddings`, which api.hanzo.ai answers 404. From
//! **v1.19.4** it posts to `{url}/embeddings` when the URL ends in `/v1`,
//! sends `EMBEDDINGS_SERVER_API_KEY` as the bearer, and knows `zen-embedding`,
//! the model api.hanzo.ai serves (stored 768 wide, the width of the node's
//! seeded prompts). api.hanzo.ai refuses that call without a key, so the node
//! needs the key of whoever is signed in to the app, and a new one whenever
//! that changes.
//!
//! What this crate decides, as pure functions so each case is testable:
//!
//! * [`signed_in_key`]: the access token of a live session in the app's
//!   keychain record ([`SESSION_RECORD`]), or `None` when signed out.
//! * [`spawn_env`]: the env the node starts with. With a node older than
//!   v1.19.4 it is the options' env exactly as before, with no key. With a
//!   newer node pointed at api.hanzo.ai it is the `/v1` base, `zen-embedding`
//!   and, when signed in, the key. The key never goes to any other host.
//! * [`SpawnedKey`] / [`needs_restart`]: whether the running node holds a
//!   different key than it would be given now, which is when the app restarts
//!   it (sign-in, sign-out, a refreshed token).
//!
//! Nothing here formats a key; [`SpawnedKey`] keeps a SHA-256 digest of it,
//! never the key, and has no `Debug`.

use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// Keychain record holding the app's IAM session: one JSON object of the
/// `@hanzo/iam` SDK's storage entries (`src/keychain.ts`).
pub const SESSION_RECORD: &str = "iam-session";
/// The SDK's access-token entry in [`SESSION_RECORD`].
pub const ACCESS_TOKEN: &str = "hanzo_iam_access_token";
/// The SDK's expiry entry (epoch milliseconds, as a string).
pub const EXPIRES_AT: &str = "hanzo_iam_expires_at";

/// Where the node sends embedding requests.
pub const URL_VAR: &str = "EMBEDDINGS_SERVER_URL";
/// The bearer the node sends with them.
pub const API_KEY_VAR: &str = "EMBEDDINGS_SERVER_API_KEY";
/// The model the node embeds with, and sizes a new database's vectors by.
pub const MODEL_VAR: &str = "DEFAULT_EMBEDDING_MODEL";
/// The models the node accepts.
pub const SUPPORTED_VAR: &str = "SUPPORTED_EMBEDDING_MODELS";

/// The one host the key may be sent to.
pub const HANZO_API_HOST: &str = "api.hanzo.ai";
/// The embeddings base a v1.19.4+ node uses on api.hanzo.ai.
pub const HANZO_EMBEDDINGS_BASE: &str = "https://api.hanzo.ai/v1";
/// The embedding model api.hanzo.ai serves.
pub const HANZO_EMBEDDING_MODEL: &str = "zen-embedding";
/// The base an older node is given: it appends Ollama's `/api/embeddings`.
pub const OLLAMA_EMBEDDINGS_URL: &str = "https://api.hanzo.ai";
/// The model an older node is given: its seeded prompts are 768-wide
/// `embeddinggemma:300m` vectors.
pub const OLLAMA_EMBEDDING_MODEL: &str = "embeddinggemma:300m";
/// The models an older node accepts.
pub const OLLAMA_SUPPORTED_MODELS: &str = "snowflake-arctic-embed:xs,embeddinggemma:300m,all-minilm:l6-v2";

/// The first node release that embeds over `POST {base}/embeddings`.
pub const OPENAI_EMBEDDINGS_SINCE: [u64; 3] = [1, 19, 4];

/// The access token of a live session in `record` (the [`SESSION_RECORD`]
/// JSON), or `None`: no record, no token, an unreadable record, or a token
/// whose [`EXPIRES_AT`] has passed. The same rule `@hanzo/app` applies to
/// decide the reader is signed in.
pub fn signed_in_key(record: Option<&str>, now_ms: u64) -> Option<String> {
    let record: serde_json::Value = serde_json::from_str(record?).ok()?;
    let token = record.get(ACCESS_TOKEN)?.as_str()?.trim();
    if token.is_empty() || !token.bytes().all(|b| b.is_ascii_graphic()) {
        return None;
    }
    match record.get(EXPIRES_AT) {
        None | Some(serde_json::Value::Null) => {}
        Some(serde_json::Value::String(s)) if s.trim().is_empty() => {}
        Some(v) => {
            let expires = match v {
                serde_json::Value::String(s) => s.trim().parse::<f64>().ok()?,
                serde_json::Value::Number(n) => n.as_f64()?,
                _ => return None,
            };
            if !((now_ms as f64) < expires) {
                return None;
            }
        }
    }
    Some(token.to_string())
}

/// `major.minor.patch` of a node version such as `v1.19.4` or `1.19.4-rc.1`.
fn parse_version(version: &str) -> Option<[u64; 3]> {
    let v = version.trim();
    let v = v.strip_prefix(['v', 'V']).unwrap_or(v);
    let core = v.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let parsed = [
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next().unwrap_or("0").parse().ok()?,
    ];
    if parts.next().is_some() {
        return None;
    }
    Some(parsed)
}

/// Whether node `version` embeds over `POST {base}/embeddings` and knows
/// `zen-embedding` (v1.19.4 and later). An unreadable version is treated as
/// an older node, which is the safe side: it keeps the env as it was.
pub fn speaks_openai_embeddings(version: &str) -> bool {
    parse_version(version).is_some_and(|v| v >= OPENAI_EMBEDDINGS_SINCE)
}

/// Whether `url` is Hanzo's API over HTTPS, any path. The key goes nowhere
/// else: not to a local Ollama, not to another provider someone typed into
/// the Node Manager, not over plain HTTP.
pub fn is_hanzo_api(url: &str) -> bool {
    let url = url.trim();
    let Some(scheme) = url.get(..8) else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("https://") {
        return false;
    }
    let authority = url[8..].split(['/', '?', '#']).next().unwrap_or("");
    let host = authority.strip_suffix(":443").unwrap_or(authority);
    host.eq_ignore_ascii_case(HANZO_API_HOST)
}

/// The default `EMBEDDINGS_SERVER_URL` for node `version`.
pub fn default_embeddings_url(version: &str) -> &'static str {
    if speaks_openai_embeddings(version) {
        HANZO_EMBEDDINGS_BASE
    } else {
        OLLAMA_EMBEDDINGS_URL
    }
}

/// The default `DEFAULT_EMBEDDING_MODEL` for node `version`.
pub fn default_embedding_model(version: &str) -> &'static str {
    if speaks_openai_embeddings(version) {
        HANZO_EMBEDDING_MODEL
    } else {
        OLLAMA_EMBEDDING_MODEL
    }
}

/// The default `SUPPORTED_EMBEDDING_MODELS` for node `version`.
pub fn default_supported_models(version: &str) -> String {
    if speaks_openai_embeddings(version) {
        format!("{HANZO_EMBEDDING_MODEL},{OLLAMA_SUPPORTED_MODELS}")
    } else {
        OLLAMA_SUPPORTED_MODELS.to_string()
    }
}

/// The env the node is spawned with.
///
/// `options_env` is the Node Manager's options as env (`options_to_env`),
/// `session_key` the [`signed_in_key`] at spawn time, `node_version` the
/// bundled node's version (`src-tauri/pins`).
///
/// * An older node gets `options_env` unchanged: no key, Ollama's base and
///   model, exactly what it was spawned with before.
/// * A v1.19.4+ node whose `EMBEDDINGS_SERVER_URL` is api.hanzo.ai gets the
///   `/v1` base and `zen-embedding` (whatever an older install saved, since
///   api.hanzo.ai serves no other embedding model), and the key when there is
///   one.
/// * A node pointed anywhere else gets the options as they are and no key.
pub fn spawn_env(
    mut options_env: HashMap<String, String>,
    session_key: Option<&str>,
    node_version: &str,
) -> HashMap<String, String> {
    // The key is the session's, never an option's.
    options_env.remove(API_KEY_VAR);
    if !speaks_openai_embeddings(node_version) {
        return options_env;
    }
    if !options_env.get(URL_VAR).is_some_and(|url| is_hanzo_api(url)) {
        return options_env;
    }
    options_env.insert(URL_VAR.to_string(), HANZO_EMBEDDINGS_BASE.to_string());
    options_env.insert(MODEL_VAR.to_string(), HANZO_EMBEDDING_MODEL.to_string());
    let supported = options_env.get(SUPPORTED_VAR).map(String::as_str).unwrap_or("");
    if !supported.split(',').any(|m| m.trim() == HANZO_EMBEDDING_MODEL) {
        let with = if supported.trim().is_empty() {
            HANZO_EMBEDDING_MODEL.to_string()
        } else {
            format!("{HANZO_EMBEDDING_MODEL},{supported}")
        };
        options_env.insert(SUPPORTED_VAR.to_string(), with);
    }
    if let Some(key) = session_key.filter(|k| !k.is_empty()) {
        options_env.insert(API_KEY_VAR.to_string(), key.to_string());
    }
    options_env
}

/// Which key a node was spawned with: a SHA-256 digest of it, or none. Two
/// spawns compare equal when they hold the same key (or both none).
#[derive(Clone, Default, PartialEq, Eq)]
pub struct SpawnedKey(Option<[u8; 32]>);

impl SpawnedKey {
    /// The key in a spawn env built by [`spawn_env`].
    pub fn of(env: &HashMap<String, String>) -> Self {
        SpawnedKey(env.get(API_KEY_VAR).map(|k| Sha256::digest(k.as_bytes()).into()))
    }

    /// Whether the node was given a key at all.
    pub fn is_signed_in(&self) -> bool {
        self.0.is_some()
    }
}

/// Whether the node must be restarted to pick up `next` (the env it would be
/// spawned with now). `running` is the key the running node holds, or `None`
/// when no node of ours is running, which never restarts: the next start
/// reads the session itself.
pub fn needs_restart(running: Option<&SpawnedKey>, next: &HashMap<String, String>) -> bool {
    running.is_some_and(|key| *key != SpawnedKey::of(next))
}
