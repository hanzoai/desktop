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
const REVOKE: &str = "/v1/iam/oauth/revoke";
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
    use std::os::unix::fs::OpenOptionsExt;
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    let mut f = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&tmp)
        .map_err(|e| format!("writing {}: {e}", tmp.display()))?;
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
    active_in(&config()?)
}

fn active_in(cfg: &Path) -> Result<Option<String>, String> {
    let doc = read_config(cfg)?;
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

/// Sign out of the identity `access_token` names, as `hanzo auth logout <owner/name>`
/// does. First, on this computer and at once: its row and any pointer at it leave
/// the CLI config (a pointer never slides onto another identity), then its tokens
/// leave the credential store, so a relaunch finds no one whatever the network
/// does. Then its refresh token is revoked at the issuer that minted it, held in
/// memory, within `REVOKE_WAIT`. Ok means the server confirmed it; an error says,
/// plainly, that it could not, and this computer is signed out either way.
#[tauri::command]
pub async fn identity_forget(access_token: String) -> Result<(), String> {
    forget_in(&credentials()?, &config()?, &access_token).await
}

/// How long the issuer is given to confirm a revocation: inside the 5 seconds the
/// app waits for the host's sign-out (`@hanzo/app` lib/signout `PATIENCE`).
const REVOKE_WAIT: std::time::Duration = std::time::Duration::from_secs(3);

/// The issuer a revocation may be sent to: an https one, as `identity_adopt`
/// refreshes only against one (and, in tests, a stand-in on this computer).
fn may_call(issuer: &str) -> bool {
    issuer.starts_with("https://") || (cfg!(test) && issuer.starts_with("http://127.0.0.1:"))
}

/// RFC 7009: hand the refresh token back to the issuer, as `@hanzo/iam`'s
/// `revoke()` does: the access token as the bearer, the refresh token in the
/// form. A redirect is refused, never followed, so the refresh token is never
/// sent on to an address the issuer names (over http, perhaps).
async fn revoke(issuer: &str, held: &Tokens, refresh: &str, client: &str) -> Result<(), String> {
    let resp = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REVOKE_WAIT)
        .build()
        .map_err(|e| e.to_string())?
        .post(format!("{issuer}{REVOKE}"))
        .bearer_auth(&held.access_token)
        .form(&[("token", refresh), ("token_type_hint", "refresh_token"), ("client_id", client)])
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "it did not answer in time".to_string() } else { "it could not be reached".to_string() })?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("it answered {}", resp.status()))
    }
}

async fn forget_in(creds: &Path, cfg: &Path, access_token: &str) -> Result<(), String> {
    let c = claims(access_token).ok_or("the access token is not a Hanzo IAM token")?;
    if c.owner.is_empty() || c.name.is_empty() {
        return Err("the access token names no owner and name".into());
    }
    let me = format!("{}/{}", c.owner, c.name);
    // This computer first, and never waiting on the network: the index, then the
    // tokens (taken, so the revoke below holds the only copy).
    {
        let _guard = lock(cfg)?;
        let mut doc = read_config(cfg)?;
        if let Some(auth) = doc.get_mut("auth").and_then(Item::as_table_mut) {
            if let Some(known) = auth.get_mut("identities").and_then(Item::as_array_of_tables_mut) {
                known.retain(|t| {
                    !(t.get("brand").and_then(Item::as_str) == Some(BRAND)
                        && t.get("owner").and_then(Item::as_str) == Some(&c.owner)
                        && t.get("name").and_then(Item::as_str) == Some(&c.name))
                });
            }
            if let Some(active) = auth.get_mut("active").and_then(Item::as_table_mut) {
                if active.get(BRAND).and_then(Item::as_str) == Some(&me) {
                    active.remove(BRAND);
                }
            }
            if let Some(within) = auth.get_mut("active_in").and_then(|t| t.get_mut(BRAND)).and_then(Item::as_table_mut) {
                if within.get(&c.owner).and_then(Item::as_str) == Some(&c.name) {
                    within.remove(&c.owner);
                }
            }
        }
        private(cfg, doc.to_string().as_bytes())?;
    }
    let held = {
        let _guard = lock(creds)?;
        let mut map = read_map(creds)?;
        let held = map.remove(&format!("{BRAND}/{me}"));
        if held.is_some() {
            private(creds, &serde_json::to_vec(&map).map_err(|e| e.to_string())?)?;
        }
        held.and_then(|raw| serde_json::from_str::<Tokens>(&raw).ok())
    };
    // Then the server. The issuer and client come from the tokens the store held,
    // never from the window: they decide where the refresh token is sent.
    let Some((held, refresh)) = held.and_then(|t| t.refresh_token.clone().map(|r| (t, r))) else { return Ok(()) };
    let stored = claims(&held.access_token).unwrap_or_default();
    let issuer = stored.iss.trim_end_matches('/');
    let revoked = if may_call(issuer) {
        revoke(issuer, &held, &refresh, &stored.azp).await
    } else {
        Err("the stored token names no https issuer".to_string())
    };
    match revoked {
        Ok(()) => {
            log::info!("signed out of {me}: its session is revoked at the issuer");
            Ok(())
        }
        Err(why) => {
            log::warn!("signed out of {me} on this computer, but the issuer did not confirm ending its session ({why}); end it from the account's sessions");
            Err(format!("Signed out on this computer, but the server could not confirm it: {why}."))
        }
    }
}

fn table<'a>(parent: &'a mut Table, key: &str) -> &'a mut Table {
    parent.entry(key).or_insert_with(toml_edit::table).as_table_mut().expect("a table")
}

#[cfg(test)]
mod tests {
    use super::{active_in, claims, expiring, forget_in, read_map};
    use std::io::{Read, Write};

    /// A stand-in issuer on a local port: answers one request with `status`, and
    /// hands back what it was sent and what `at_request` said when it arrived.
    fn issuer(status: &'static str, at_request: impl Fn() -> bool + Send + 'static) -> (String, std::thread::JoinHandle<(String, bool)>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let seen = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = vec![0u8; 16384];
            let mut got = String::new();
            while !got.contains("\r\n\r\n") || got.split("\r\n\r\n").nth(1).map_or(0, str::len) < 10 {
                let n = s.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                got.push_str(&String::from_utf8_lossy(&buf[..n]));
                if got.split("\r\n\r\n").nth(1).is_some_and(|b| b.contains("client_id")) {
                    break;
                }
            }
            let then = at_request();
            write!(s, "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
            (got, then)
        });
        (url, seen)
    }

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

    /// What the credentials file holds for an identity: a stored access token that
    /// names its own issuer and client, and the refresh token.
    fn stored(issuer: &str, refresh: &str) -> String {
        let access = jwt(&format!(r#"{{"owner":"hanzo","name":"z","iss":"{issuer}","azp":"hanzo-app"}}"#));
        serde_json::to_string(&serde_json::json!({ "access_token": access, "refresh_token": refresh })).unwrap()
    }

    /// The window's token for the same identity, naming somewhere else entirely.
    fn window_token() -> String {
        jwt(r#"{"owner":"hanzo","name":"z","iss":"https://elsewhere.example","azp":"another-client"}"#)
    }

    fn creds_with(path: &std::path::Path, entries: &[(&str, String)]) {
        let map: std::collections::BTreeMap<_, _> = entries.iter().map(|(k, v)| (k.to_string(), v.clone())).collect();
        std::fs::write(path, serde_json::to_vec(&map).unwrap()).unwrap();
    }

    #[tokio::test]
    async fn signing_out_forgets_that_identity_alone_at_once_then_the_issuer_confirms_and_a_relaunch_finds_no_one() {
        let dir = tempfile::tempdir().unwrap();
        let (creds, cfg) = (dir.path().join("credentials"), dir.path().join("config.toml"));
        let path = creds.clone();
        let (url, seen) = issuer("200 OK", move || !read_map(&path).unwrap().contains_key("hanzo/hanzo/z"));
        creds_with(&creds, &[("hanzo/hanzo/z", stored(&url, "r-z")), ("hanzo/acme/ada", "{}".into()), ("lux/hanzo/z", "{}".into())]);
        std::fs::write(
            &cfg,
            r#"[[auth.identities]]
brand = "hanzo"
owner = "hanzo"
name = "z"

[[auth.identities]]
brand = "hanzo"
owner = "acme"
name = "ada"

[auth.active]
hanzo = "hanzo/z"

[auth.active_in.hanzo]
hanzo = "z"
acme = "ada"
"#,
        )
        .unwrap();
        assert_eq!(active_in(&cfg).unwrap().as_deref(), Some("hanzo/hanzo/z"));

        // The window's token names another issuer and client: the stored token decides.
        forget_in(&creds, &cfg, &window_token()).await.expect("a confirmed revoke resolves");
        let (sent, gone_first) = seen.join().unwrap();
        assert!(gone_first, "the identity left this computer before the revoke was sent");
        assert!(sent.starts_with("POST /v1/iam/oauth/revoke "), "{sent}");
        let (head, body) = sent.split_once("\r\n\r\n").unwrap();
        let bearer = serde_json::from_str::<serde_json::Value>(&stored(&url, "r-z")).unwrap()["access_token"].as_str().unwrap().to_string();
        assert!(head.to_ascii_lowercase().contains(&format!("authorization: bearer {}", bearer.to_ascii_lowercase())), "{head}");
        assert_eq!(body, "token=r-z&token_type_hint=refresh_token&client_id=hanzo-app");

        // The next launch (identity_adopt) starts from the active identity: there is none.
        assert_eq!(active_in(&cfg).unwrap(), None);
        let left = read_map(&creds).unwrap();
        assert!(!left.contains_key("hanzo/hanzo/z"), "its tokens are gone");
        assert!(left.contains_key("hanzo/acme/ada") && left.contains_key("lux/hanzo/z"), "the others are untouched");
        let text = std::fs::read_to_string(&cfg).unwrap();
        assert!(!text.contains("name = \"z\""), "its row is gone: {text}");
        assert!(text.contains("name = \"ada\"") && text.contains("acme = \"ada\""), "the other identity is untouched: {text}");
    }

    /// A stand-in issuer that takes the request and does not answer for 10 seconds.
    fn slow_issuer() -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            let (s, _) = listener.accept().unwrap();
            std::thread::sleep(std::time::Duration::from_secs(10));
            drop(s);
        });
        url
    }

    /// Whether a relaunch (identity_adopt, which starts from the active identity)
    /// would find anyone, and whether the identity's tokens are still on disk.
    fn relaunch_finds(creds: &std::path::Path, cfg: &std::path::Path) -> (Option<String>, bool) {
        (active_in(cfg).unwrap(), read_map(creds).unwrap().contains_key("hanzo/hanzo/z"))
    }

    /// Slow, down or refusing: this computer is signed out at once, the answer comes
    /// within 3.5 seconds, and it is a rejection that says the server did not confirm.
    #[tokio::test]
    async fn an_issuer_that_is_slow_down_or_refusing_never_holds_up_signing_this_computer_out() {
        for case in ["slow", "down", "refuses"] {
            let dir = tempfile::tempdir().unwrap();
            let (creds, cfg) = (dir.path().join("credentials"), dir.path().join("config.toml"));
            let url = match case {
                "slow" => slow_issuer(),
                "down" => "http://127.0.0.1:9".into(),
                _ => issuer("500 Internal Server Error", || true).0,
            };
            creds_with(&creds, &[("hanzo/hanzo/z", stored(&url, "r"))]);
            std::fs::write(&cfg, "[auth.active]\nhanzo = \"hanzo/z\"\n").unwrap();
            let token = window_token();
            let started = std::time::Instant::now();
            let forgetting = forget_in(&creds, &cfg, &token);
            tokio::pin!(forgetting);
            // While the issuer is still being asked, the identity is already gone.
            let early = tokio::time::timeout(std::time::Duration::from_millis(300), &mut forgetting).await;
            assert_eq!(relaunch_finds(&creds, &cfg), (None, false), "{case}: gone at once");
            let result = match early {
                Ok(r) => r,
                Err(_) => forgetting.await,
            };
            assert!(started.elapsed() < std::time::Duration::from_millis(3500), "{case}: took {:?}", started.elapsed());
            let why = result.expect_err(case);
            assert!(why.starts_with("Signed out on this computer, but the server could not confirm it"), "{case}: {why}");
            assert_eq!(relaunch_finds(&creds, &cfg), (None, false), "{case}: a relaunch adopts nobody");
        }
    }

    /// A 307 or 308 would re-send the form, refresh token included, to wherever
    /// it points. It is refused: nothing reaches the address, and this computer is
    /// still signed out.
    #[tokio::test]
    async fn a_redirect_from_the_issuer_is_never_followed() {
        let elsewhere = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        elsewhere.set_nonblocking(true).unwrap();
        let to = format!("http://{}/steal", elsewhere.local_addr().unwrap());
        let line: &'static str = Box::leak(format!("307 Temporary Redirect\r\nLocation: {to}").into_boxed_str());
        let dir = tempfile::tempdir().unwrap();
        let (creds, cfg) = (dir.path().join("credentials"), dir.path().join("config.toml"));
        let (url, seen) = issuer(line, || true);
        creds_with(&creds, &[("hanzo/hanzo/z", stored(&url, "r"))]);
        assert!(forget_in(&creds, &cfg, &window_token()).await.is_err(), "an unfollowed redirect is not a confirmation");
        seen.join().unwrap();
        assert!(matches!(elsewhere.accept(), Err(e) if e.kind() == std::io::ErrorKind::WouldBlock), "the redirect was followed");
        assert!(read_map(&creds).unwrap().is_empty());
    }

    /// A stored token with an http issuer is never sent anything.
    #[tokio::test]
    async fn no_revoke_reaches_an_issuer_that_is_not_https() {
        let plain = std::net::TcpListener::bind("0.0.0.0:0").unwrap();
        plain.set_nonblocking(true).unwrap();
        let url = format!("http://localhost:{}", plain.local_addr().unwrap().port());
        let dir = tempfile::tempdir().unwrap();
        let (creds, cfg) = (dir.path().join("credentials"), dir.path().join("config.toml"));
        creds_with(&creds, &[("hanzo/hanzo/z", stored(&url, "r"))]);
        assert!(forget_in(&creds, &cfg, &window_token()).await.is_err());
        assert!(matches!(plain.accept(), Err(e) if e.kind() == std::io::ErrorKind::WouldBlock), "an http issuer was called");
        assert!(read_map(&creds).unwrap().is_empty());
    }
}
