//! One local identity, shared with the Hanzo CLI.
//!
//! The CLI (`hanzo/cli` src/iam) keeps each signed-in identity's tokens in
//! `<data dir>/hanzo/credentials` (a JSON map `brand/owner/name` -> token set)
//! and an index of who is signed in, with the active one, in
//! `<config dir>/hanzo/config.toml`. This module reads and writes those same two
//! files under the same cross-process locks (`credentials.lock`,
//! `config.toml.lock`, and `refresh.lock` around a refresh), so a sign-in here is
//! a sign-in there, and the reverse.
//!
//! IAM rotates single-use refresh tokens and revokes the family on a replay, so
//! the refresh token has one holder: this file. The window keeps an access token
//! only, and asks `identity_adopt` for a fresh one, which refreshes under the
//! refresh lock exactly as the CLI does.

use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};
use toml_edit::{value, ArrayOfTables, DocumentMut, Item, Table};

const BRAND: &str = "hanzo";
const TOKEN: &str = "/v1/iam/oauth/token";
/// A token this close to its end is spent.
const LEEWAY: i64 = 60;

/// An OAuth token response, as the CLI stores it (`TokenSet`).
#[derive(Clone, Serialize, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    #[serde(default = "bearer")]
    pub token_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

fn bearer() -> String {
    "Bearer".into()
}

#[derive(Deserialize, Default)]
struct Claims {
    #[serde(default)]
    owner: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    iss: String,
    #[serde(default)]
    azp: String,
    #[serde(default)]
    exp: i64,
}

fn claims(jwt: &str) -> Option<Claims> {
    let payload = jwt.split('.').nth(1)?;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn expiring(jwt: &str) -> bool {
    claims(jwt).map_or(true, |c| c.exp <= now() + LEEWAY)
}

fn credentials() -> Result<PathBuf, String> {
    Ok(dirs::data_local_dir().ok_or("no data directory")?.join("hanzo").join("credentials"))
}

fn config() -> Result<PathBuf, String> {
    Ok(dirs::config_dir().ok_or("no config directory")?.join("hanzo").join("config.toml"))
}

/// An exclusive cross-process lock on `<path>.lock`, held until dropped.
struct Lock(File);

fn lock(path: &Path) -> Result<Lock, String> {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".lock");
    let file = path.with_file_name(name);
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    }
    let f = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&file)
        .map_err(|e| format!("opening {}: {e}", file.display()))?;
    f.lock().map_err(|e| format!("locking {}: {e}", file.display()))?;
    Ok(Lock(f))
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

/// Write `bytes` to `path` owner-only, by rename, so a reader never sees half.
fn private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    let mut open = OpenOptions::new();
    open.create(true).truncate(true).write(true);
    // Elsewhere the file is as private as the profile folder it is in.
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        open.mode(0o600);
    }
    let mut f = open.open(&tmp).map_err(|e| format!("writing {}: {e}", tmp.display()))?;
    f.write_all(bytes).and_then(|_| f.sync_all()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| format!("replacing {}: {e}", path.display()))
}

fn read_map(path: &Path) -> Result<BTreeMap<String, String>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("the credential store is corrupt: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(format!("reading the credential store: {e}")),
    }
}

fn read_config(path: &Path) -> Result<DocumentMut, String> {
    match fs::read_to_string(path) {
        Ok(text) => text.parse().map_err(|e| format!("the CLI config is unreadable: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(DocumentMut::new()),
        Err(e) => Err(format!("reading the CLI config: {e}")),
    }
}

/// The active identity's store key, `brand/owner/name`.
fn active() -> Result<Option<String>, String> {
    let doc = read_config(&config()?)?;
    let who = doc.get("auth").and_then(|a| a.get("active")).and_then(|a| a.get(BRAND)).and_then(Item::as_str);
    Ok(who.map(|who| format!("{BRAND}/{who}")))
}

fn held(key: &str) -> Result<Option<Tokens>, String> {
    let map = read_map(&credentials()?)?;
    Ok(map.get(key).and_then(|raw| serde_json::from_str(raw).ok()))
}

fn store(key: &str, tokens: &Tokens) -> Result<(), String> {
    let path = credentials()?;
    let _guard = lock(&path)?;
    let mut map = read_map(&path)?;
    map.insert(key.into(), serde_json::to_string(tokens).map_err(|e| e.to_string())?);
    private(&path, &serde_json::to_vec(&map).map_err(|e| e.to_string())?)
}

/// The signed-in identity's tokens, refreshed if they have run out, or None when
/// nobody is signed in or the session is over. Never opens a browser.
#[tauri::command]
pub async fn identity_adopt() -> Result<Option<Tokens>, String> {
    let Some(key) = active()? else { return Ok(None) };
    let Some(tokens) = held(&key)? else { return Ok(None) };
    if !expiring(&tokens.access_token) {
        return Ok(Some(tokens));
    }
    if tokens.refresh_token.is_none() {
        return Ok(None);
    }
    // One refresh at a time across every process: the token is single-use. What
    // the process ahead of us stored is read again once the lock is ours.
    let creds = credentials()?;
    let _refreshing = lock(&creds.with_file_name("refresh"))?;
    let Some(tokens) = held(&key)? else { return Ok(None) };
    if !expiring(&tokens.access_token) {
        return Ok(Some(tokens));
    }
    let (Some(refresh), Some(c)) = (tokens.refresh_token.clone(), claims(&tokens.access_token)) else { return Ok(None) };
    let client = if c.azp.is_empty() { return Ok(None) } else { c.azp };
    let issuer = c.iss.trim_end_matches('/');
    if !issuer.starts_with("https://") {
        return Ok(None);
    }
    let resp = reqwest::Client::new()
        .post(format!("{issuer}{TOKEN}"))
        .form(&[("grant_type", "refresh_token"), ("refresh_token", refresh.as_str()), ("client_id", client.as_str())])
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("refreshing the session: {e}"))?;
    let status = resp.status();
    if matches!(status.as_u16(), 400 | 401 | 403) {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!("refreshing the session: {status}"));
    }
    let next: Tokens = resp.json().await.map_err(|e| format!("reading the refreshed session: {e}"))?;
    store(&key, &next)?;
    Ok(Some(next))
}

/// File the identity `tokens` authenticate as, where the CLI looks for it. It
/// becomes the active identity only when none is, as a CLI sign-in does: a new
/// account never takes the active one's place.
#[tauri::command]
pub fn identity_file(tokens: Tokens) -> Result<(), String> {
    let c = claims(&tokens.access_token).ok_or("the access token is not a Hanzo IAM token")?;
    if c.owner.is_empty() || c.name.is_empty() || c.owner.contains('/') || c.name.contains('/') {
        return Err("the access token names no owner and name".into());
    }
    store(&format!("{BRAND}/{}/{}", c.owner, c.name), &tokens)?;

    let path = config()?;
    let _guard = lock(&path)?;
    let mut doc = read_config(&path)?;
    let auth = table(doc.as_table_mut(), "auth");
    let known = auth
        .entry("identities")
        .or_insert(Item::ArrayOfTables(ArrayOfTables::new()))
        .as_array_of_tables_mut()
        .ok_or("auth.identities is not a list")?;
    let listed = known.iter().any(|t| {
        t.get("brand").and_then(Item::as_str) == Some(BRAND)
            && t.get("owner").and_then(Item::as_str) == Some(&c.owner)
            && t.get("name").and_then(Item::as_str) == Some(&c.name)
    });
    if !listed {
        let mut row = Table::new();
        row["brand"] = value(BRAND);
        row["owner"] = value(c.owner.as_str());
        row["name"] = value(c.name.as_str());
        known.push(row);
    }
    let chosen = table(auth, "active");
    if chosen.get(BRAND).is_none() {
        chosen[BRAND] = value(format!("{}/{}", c.owner, c.name));
    }
    let within = table(table(auth, "active_in"), BRAND);
    within[c.owner.as_str()] = value(c.name.as_str());
    private(&path, doc.to_string().as_bytes())
}

fn table<'a>(parent: &'a mut Table, key: &str) -> &'a mut Table {
    parent.entry(key).or_insert_with(toml_edit::table).as_table_mut().expect("a table")
}

#[cfg(test)]
mod tests {
    use super::{claims, expiring};

    fn jwt(claims: &str) -> String {
        use base64::Engine;
        let e = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        format!("{}.{}.sig", e.encode("{}"), e.encode(claims))
    }

    #[test]
    fn a_token_names_who_it_is_for() {
        let c = claims(&jwt(r#"{"owner":"hanzo","name":"z","iss":"https://hanzo.id","azp":"hanzo-app","exp":1}"#)).unwrap();
        assert_eq!((c.owner.as_str(), c.name.as_str(), c.azp.as_str()), ("hanzo", "z", "hanzo-app"));
    }

    #[test]
    fn a_token_at_its_end_is_spent() {
        assert!(expiring(&jwt(r#"{"exp":1}"#)));
        assert!(!expiring(&jwt(r#"{"exp":99999999999}"#)));
        assert!(expiring("not a token"));
    }
}
