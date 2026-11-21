//! Models on this computer, run by Hanzo's own engine.
//!
//! Storage is the engine's: the Hugging Face hub cache (`HF_HUB_CACHE`, else
//! `HF_HOME/hub`, else `~/.cache/huggingface/hub`), one `models--org--name`
//! folder per model, `snapshots/<sha>/<file>` and `refs/main`. That is what
//! `hanzo-engine serve -m org/name` loads from and what `hanzo engine list`
//! and `hanzo-engine cache list` read, so a model fetched here is theirs too.
//!
//! The download is done here rather than by `hanzo engine pull`, for two
//! measured reasons: that CLI is not part of the app, and it fetches every
//! file in the repository. For `zenlm/zen-nano-0.6b` that is 6.6 GB (eight
//! GGUF quantisations and an MLX copy beside the weights) where the engine
//! needs 1.2 GB. [`wanted`] keeps the top-level files and drops the duplicate
//! weight formats. Files land as `<file>.part` and are renamed when complete,
//! and `refs/main` is written last, the way the CLI writes them.
//!
//! One model is served at a time, on 127.0.0.1:36900, only after the person
//! chooses it, and it is stopped when the app exits ([`stop_all`]).

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Where local chat finds the served model (`LOCAL_ENGINE_PORT_URL` in local-ai.tsx).
pub const PORT: u16 = 36900;
/// The event a download reports on: `{ repo, done, total }` in bytes.
pub const PROGRESS_EVENT: &str = "local-models-progress";
/// What a cancelled download fails with; the window shows it as cancelled, not as an error.
pub const CANCELLED: &str = "Download cancelled.";

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Cached {
    pub repo: String,
    pub bytes: u64,
}

#[derive(Serialize)]
pub struct Status {
    /// The engine binary that serves models, or `None` when none is installed.
    pub engine: Option<String>,
    pub cache_dir: String,
    /// Models whose download finished.
    pub installed: Vec<Cached>,
    pub pulling: Option<String>,
    /// The model being served, while its process is alive.
    pub serving: Option<String>,
    /// The last lines the engine printed when it stopped on its own.
    pub serve_error: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress<'a> {
    repo: &'a str,
    done: u64,
    total: u64,
}

#[derive(Deserialize)]
struct Meta {
    sha: String,
    siblings: Vec<Sibling>,
}

#[derive(Deserialize)]
struct Sibling {
    rfilename: String,
    size: Option<u64>,
}

struct Served {
    repo: String,
    child: Child,
    stderr: Arc<Mutex<String>>,
}

type Pulling = Mutex<Option<(String, Arc<AtomicBool>)>>;

fn pulling() -> &'static Pulling {
    static P: OnceLock<Pulling> = OnceLock::new();
    P.get_or_init(|| Mutex::new(None))
}

fn served() -> &'static Mutex<Option<Served>> {
    static S: OnceLock<Mutex<Option<Served>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// The last thing a served engine said before it stopped by itself.
fn last_exit() -> &'static Mutex<Option<String>> {
    static E: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(None))
}

/// The engine's cache directory, from the same variables the engine reads.
pub fn cache_dir(hub_cache: Option<&str>, hf_home: Option<&str>, home: Option<&Path>) -> PathBuf {
    if let Some(dir) = hub_cache.filter(|v| !v.is_empty()) {
        return PathBuf::from(dir);
    }
    if let Some(dir) = hf_home.filter(|v| !v.is_empty()) {
        return Path::new(dir).join("hub");
    }
    home.unwrap_or(Path::new(".")).join(".cache").join("huggingface").join("hub")
}

fn this_cache_dir() -> PathBuf {
    cache_dir(
        std::env::var("HF_HUB_CACHE").ok().as_deref(),
        std::env::var("HF_HOME").ok().as_deref(),
        dirs::home_dir().as_deref(),
    )
}

/// `org/name` with nothing that could leave the cache folder. The repo id
/// comes from the window, so it is checked before it becomes a path or a URL.
pub fn valid_repo(repo: &str) -> bool {
    let ok = |p: Option<&str>| {
        p.is_some_and(|p| {
            !p.is_empty()
                && !p.starts_with('.')
                && p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        })
    };
    let mut parts = repo.split('/');
    ok(parts.next()) && ok(parts.next()) && parts.next().is_none()
}

fn repo_folder(repo: &str) -> String {
    format!("models--{}", repo.replace('/', "--"))
}

/// The files the engine needs: top-level files only (the subfolders hold other
/// formats), and no weight format that duplicates the safetensors.
pub fn wanted(files: &[String]) -> Vec<String> {
    let top: Vec<&String> = files.iter().filter(|f| plain_name(f)).collect();
    let has_safetensors = top.iter().any(|f| f.ends_with(".safetensors"));
    top.into_iter()
        .filter(|f| {
            let other_format = [".gguf", ".onnx", ".h5", ".msgpack", ".ckpt"].iter().any(|e| f.ends_with(e));
            let pytorch_copy = has_safetensors && [".bin", ".pt", ".pth"].iter().any(|e| f.ends_with(e));
            !other_format && !pytorch_copy && f.as_str() != ".gitattributes"
        })
        .cloned()
        .collect()
}

/// One file name and nothing else, on every platform. The names come from the
/// library (any mirror `HF_ENDPOINT` names) and are joined onto the snapshot
/// folder, so `..\x` or `C:\x`, harmless on a Mac, would write outside the
/// cache on Windows.
fn plain_name(f: &str) -> bool {
    let mut parts = Path::new(f).components();
    matches!(parts.next(), Some(std::path::Component::Normal(_)))
        && parts.next().is_none()
        && !f.contains(['/', '\\', ':'])
}

/// Finished models in the cache: `refs/main` names a snapshot and no file in
/// it is still a `.part`.
pub fn list_cached(cache: &Path) -> Vec<Cached> {
    let Ok(entries) = std::fs::read_dir(cache) else { return Vec::new() };
    let mut out: Vec<Cached> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let repo = name.strip_prefix("models--")?.replacen("--", "/", 1);
            let sha = std::fs::read_to_string(e.path().join("refs").join("main")).ok()?;
            let snap = e.path().join("snapshots").join(sha.trim());
            let mut bytes = 0;
            for f in walk(&snap) {
                if f.extension().is_some_and(|x| x == "part") {
                    return None;
                }
                bytes += std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0);
            }
            (bytes > 0).then_some(Cached { repo, bytes })
        })
        .collect();
    out.sort_by(|a, b| a.repo.cmp(&b.repo));
    out
}

fn walk(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .flat_map(|e| {
            let p = e.path();
            if p.is_dir() {
                walk(&p)
            } else {
                vec![p]
            }
        })
        .collect()
}

fn network(e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "This computer could not reach the model library. Check the internet connection and try again.".into()
    } else {
        format!("The download stopped: {e}")
    }
}

/// Download `repo`'s needed files into `cache`, reporting `(done, total)` bytes.
pub async fn pull_into(
    endpoint: &str,
    cache: &Path,
    repo: &str,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let meta: Meta = client
        .get(format!("{endpoint}/api/models/{repo}?blobs=true"))
        .send()
        .await
        .map_err(network)?
        .error_for_status()
        .map_err(|e| format!("The model library has no model called {repo} ({e})."))?
        .json()
        .await
        .map_err(|e| format!("The model library answered in a way this app does not understand: {e}"))?;
    // The sha becomes a folder name.
    if meta.sha.is_empty() || !meta.sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("The model library gave no version for this model.".into());
    }
    let names: Vec<String> = meta.siblings.iter().map(|s| s.rfilename.clone()).collect();
    let files: Vec<(String, u64)> = wanted(&names)
        .into_iter()
        .map(|f| {
            let size = meta.siblings.iter().find(|s| s.rfilename == f).and_then(|s| s.size).unwrap_or(0);
            (f, size)
        })
        .collect();
    let total: u64 = files.iter().map(|(_, s)| s).sum();
    let root = cache.join(repo_folder(repo));
    let snap = root.join("snapshots").join(&meta.sha);
    std::fs::create_dir_all(&snap).map_err(|e| format!("Could not make the model folder: {e}"))?;

    let mut done = 0u64;
    let mut last = Instant::now();
    progress(done, total);
    for (file, size) in &files {
        let dest = snap.join(file);
        // A file already complete from an earlier, interrupted download is kept.
        if *size > 0 && std::fs::metadata(&dest).map(|m| m.len()).ok() == Some(*size) {
            done += size;
            continue;
        }
        let part = snap.join(format!("{file}.part"));
        let res = client
            .get(format!("{endpoint}/{repo}/resolve/{}/{file}", meta.sha))
            .send()
            .await
            .map_err(network)?
            .error_for_status()
            .map_err(|e| format!("The model library refused {file} ({e})."))?;
        let mut out = std::fs::File::create(&part).map_err(|e| format!("Could not write {file}: {e}"))?;
        let mut stream = res.bytes_stream();
        let mut got = 0u64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                drop(out);
                let _ = std::fs::remove_file(&part);
                return Err(CANCELLED.into());
            }
            let Some(chunk) = stream.next().await else { break };
            let chunk = chunk.map_err(network)?;
            out.write_all(&chunk).map_err(|e| format!("Could not write {file}: {e}"))?;
            got += chunk.len() as u64;
            done += chunk.len() as u64;
            if last.elapsed() >= Duration::from_millis(200) {
                last = Instant::now();
                progress(done, total);
            }
        }
        out.flush().map_err(|e| format!("Could not write {file}: {e}"))?;
        drop(out);
        // A connection that closes cleanly but early still ends the stream; only
        // the size the library declared tells a short file from a whole one.
        if *size > 0 && got != *size {
            return Err(format!(
                "{file} arrived incomplete ({got} of {size} bytes), so the model was not saved. Try the download again."
            ));
        }
        std::fs::rename(&part, &dest).map_err(|e| format!("Could not finish {file}: {e}"))?;
    }
    let refs = root.join("refs");
    std::fs::create_dir_all(&refs).map_err(|e| e.to_string())?;
    std::fs::write(refs.join("main"), &meta.sha).map_err(|e| e.to_string())?;
    progress(done.max(total), done.max(total));
    Ok(())
}

fn engine_bin() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf));
    hanzo_engine_bin::resolve(
        std::env::var_os(hanzo_engine_bin::OVERRIDE_VAR).as_deref(),
        exe_dir.as_deref(),
        std::env::var_os("PATH").as_deref(),
    )
}

/// The served model, if its process is still alive. One that stopped by
/// itself is cleared and what it last printed is kept for [`Status`].
fn alive() -> Option<String> {
    let mut slot = served().lock().ok()?;
    let up = slot.as_mut()?;
    if let Ok(None) = up.child.try_wait() {
        return Some(up.repo.clone());
    }
    let said = up.stderr.lock().map(|s| s.trim().to_string()).unwrap_or_default();
    if let Ok(mut e) = last_exit().lock() {
        *e = Some(if said.is_empty() { "The engine stopped as it started.".into() } else { said });
    }
    *slot = None;
    None
}

fn stop_serving() {
    if let Ok(mut slot) = served().lock() {
        if let Some(mut up) = slot.take() {
            let _ = up.child.kill();
            let _ = up.child.wait();
        }
    }
}

/// The app is leaving: stop the model this app serves (nothing else on the
/// port) and call off a download.
pub fn stop_all() {
    stop_serving();
    local_models_cancel();
}

#[tauri::command]
pub fn local_models_status() -> Status {
    let cache = this_cache_dir();
    let serving = alive();
    Status {
        engine: engine_bin().map(|p| p.to_string_lossy().into_owned()),
        installed: list_cached(&cache),
        cache_dir: cache.to_string_lossy().into_owned(),
        pulling: pulling().lock().ok().and_then(|p| p.as_ref().map(|(r, _)| r.clone())),
        serve_error: if serving.is_none() { last_exit().lock().ok().and_then(|e| e.clone()) } else { None },
        serving,
    }
}

#[tauri::command]
pub async fn local_models_pull(app: tauri::AppHandle, repo: String) -> Result<(), String> {
    if !valid_repo(&repo) {
        return Err(format!("{repo} is not a model name."));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut p = pulling().lock().map_err(|e| e.to_string())?;
        if let Some((other, _)) = p.as_ref() {
            return Err(format!("{other} is still downloading. One download at a time."));
        }
        *p = Some((repo.clone(), cancel.clone()));
    }
    let endpoint = std::env::var("HF_ENDPOINT").unwrap_or_else(|_| "https://huggingface.co".into());
    let result = pull_into(endpoint.trim_end_matches('/'), &this_cache_dir(), &repo, &cancel, |done, total| {
        let _ = app.emit(PROGRESS_EVENT, Progress { repo: &repo, done, total });
    })
    .await;
    if let Ok(mut p) = pulling().lock() {
        *p = None;
    }
    if let Err(e) = &result {
        log::info!("[local-models] download of {repo} ended: {e}");
    }
    result
}

/// Calls the running download off. False when there was none.
#[tauri::command]
pub fn local_models_cancel() -> bool {
    pulling()
        .lock()
        .ok()
        .and_then(|p| p.as_ref().map(|(_, c)| c.store(true, Ordering::Relaxed)))
        .is_some()
}

#[tauri::command]
pub fn local_models_remove(repo: String) -> Result<(), String> {
    if !valid_repo(&repo) {
        return Err(format!("{repo} is not a model name."));
    }
    if alive().as_deref() == Some(repo.as_str()) {
        stop_serving();
    }
    match std::fs::remove_dir_all(this_cache_dir().join(repo_folder(&repo))) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Could not remove {repo}: {e}")),
        _ => Ok(()),
    }
}

/// Serve `repo` on 127.0.0.1:36900, replacing whatever this app was serving.
/// Returns once the process has started; the window waits for `/health`.
#[tauri::command]
pub fn local_models_serve(repo: String) -> Result<(), String> {
    if !valid_repo(&repo) {
        return Err(format!("{repo} is not a model name."));
    }
    let cache = this_cache_dir();
    if !list_cached(&cache).iter().any(|c| c.repo == repo) {
        return Err(format!("{repo} is not downloaded yet."));
    }
    let bin = engine_bin().ok_or_else(|| "The Hanzo engine is not installed on this computer.".to_string())?;
    if alive().as_deref() == Some(repo.as_str()) {
        return Ok(());
    }
    stop_serving();
    if let Ok(mut e) = last_exit().lock() {
        *e = None;
    }
    log::info!("[local-models] serving {repo} with {} on 127.0.0.1:{PORT}", bin.display());
    let mut child = Command::new(&bin)
        // 127.0.0.1, not the engine's default 0.0.0.0: the model is for this computer only.
        .args(["serve", "-m", &repo, "-p", &PORT.to_string(), "--host", "127.0.0.1"])
        .env("HF_HUB_CACHE", &cache)
        // Everything it needs is already here; it must not fetch anything else.
        .env("HF_HUB_OFFLINE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("The Hanzo engine did not start: {e}"))?;
    let stderr = Arc::new(Mutex::new(String::new()));
    if let Some(err) = child.stderr.take() {
        let keep = stderr.clone();
        std::thread::spawn(move || {
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                if let Ok(mut s) = keep.lock() {
                    s.push_str(&line);
                    s.push('\n');
                    // Only the tail is ever shown.
                    if s.len() > 4000 {
                        let cut = (s.len() - 2000..s.len()).find(|i| s.is_char_boundary(*i)).unwrap_or(0);
                        s.drain(..cut);
                    }
                }
            }
        });
    }
    *served().lock().map_err(|e| e.to_string())? = Some(Served { repo, child, stderr });
    Ok(())
}

#[tauri::command]
pub fn local_models_stop() {
    stop_serving();
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn the_cache_is_where_the_engine_looks() {
        let home = Path::new("/home/a");
        assert_eq!(cache_dir(Some("/c"), Some("/h"), Some(home)), PathBuf::from("/c"));
        assert_eq!(cache_dir(None, Some("/h"), Some(home)), PathBuf::from("/h/hub"));
        assert_eq!(cache_dir(Some(""), None, Some(home)), PathBuf::from("/home/a/.cache/huggingface/hub"));
    }

    #[test]
    fn a_repo_id_cannot_climb_out_of_the_cache() {
        assert!(valid_repo("zenlm/zen-nano-0.6b"));
        assert!(valid_repo("Qwen/Qwen3-0.6B"));
        for bad in ["zen-nano", "a/b/c", "../x", "a/..", "a/.hidden", "/abs", "a/", "a b/c", "a\\b/c", "a/b?x"] {
            assert!(!valid_repo(bad), "{bad}");
        }
    }

    #[test]
    fn only_what_the_engine_loads_is_fetched() {
        // zenlm/zen-nano-0.6b's real file list (2026-11-21), trimmed.
        let files: Vec<String> = [
            ".gitattributes", "LICENSE", "README.md", "config.json", "generation_config.json",
            "chat_template.jinja", "gguf/zen-nano-0.6b-Q4_K_M.gguf", "gguf/zen-nano-f16.gguf",
            "merges.txt", "mlx/model.safetensors", "mlx/config.json", "model.safetensors",
            "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json",
            "training_args.bin", "vocab.json",
        ]
        .map(String::from)
        .to_vec();
        let got = wanted(&files);
        for kept in ["model.safetensors", "tokenizer.json", "chat_template.jinja", "config.json"] {
            assert!(got.contains(&kept.to_string()), "{kept}");
        }
        for gone in ["gguf/zen-nano-f16.gguf", "mlx/model.safetensors", "training_args.bin", ".gitattributes"] {
            assert!(!got.contains(&gone.to_string()), "{gone}");
        }
        // Without safetensors, PyTorch weights are the weights.
        assert_eq!(wanted(&["pytorch_model.bin".to_string()]), vec!["pytorch_model.bin".to_string()]);
    }

    #[test]
    fn a_hostile_library_cannot_name_a_file_outside_the_snapshot() {
        let files: Vec<String> = [
            "..\\..\\x", "C:\\x", "C:x", "/etc/x", "a/../../x", "..", ".", "", "a\\b", "x:stream", "config.json",
        ]
        .map(String::from)
        .to_vec();
        assert_eq!(wanted(&files), vec!["config.json".to_string()]);
    }

    #[test]
    fn a_model_counts_once_its_download_finished() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("models--zenlm--zen-nano-0.6b");
        let snap = root.join("snapshots").join("abc");
        std::fs::create_dir_all(&snap).unwrap();
        std::fs::write(snap.join("model.safetensors.part"), b"half").unwrap();
        std::fs::create_dir_all(root.join("refs")).unwrap();
        std::fs::write(root.join("refs").join("main"), "abc").unwrap();
        assert!(list_cached(tmp.path()).is_empty(), "a .part file means unfinished");
        std::fs::rename(snap.join("model.safetensors.part"), snap.join("model.safetensors")).unwrap();
        std::fs::write(snap.join("config.json"), b"{}").unwrap();
        assert_eq!(list_cached(tmp.path()), vec![Cached { repo: "zenlm/zen-nano-0.6b".into(), bytes: 6 }]);
        // No refs/main: the download never got to the end.
        std::fs::create_dir_all(tmp.path().join("models--Qwen--Qwen3-0.6B/snapshots/x")).unwrap();
        assert_eq!(list_cached(tmp.path()).len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn leaving_the_app_ends_the_served_engine() {
        let child = Command::new("sleep").arg("30").spawn().unwrap();
        *served().lock().unwrap() = Some(Served { repo: "zenlm/zen-nano-0.6b".into(), child, stderr: Default::default() });
        assert_eq!(alive().as_deref(), Some("zenlm/zen-nano-0.6b"));
        stop_all();
        assert_eq!(alive(), None);
    }

    /// Tray Quit ends the process with process::exit, which skips RunEvent::Exit,
    /// so it stops the model itself; the node's kill(), behind "Reset connection"
    /// and respawn, must not.
    #[test]
    fn only_the_exit_paths_stop_the_model() {
        let tray = include_str!("tray.rs");
        let quit = &tray[tray.find("\"quit\" =>").unwrap()..];
        assert!(quit[..quit.find("std::process::exit(0)").unwrap()].contains("crate::local_models::stop_all();"));
        let node = include_str!("local_hanzo_node/hanzo_node_manager.rs");
        let kill = &node[node.find("pub async fn kill").unwrap()..];
        assert!(!kill[..kill.find("\n    }\n").unwrap()].contains("crate::local_models::stop_all();"));
        let main = include_str!("main.rs");
        let exit = &main[main.find("RunEvent::Exit {").unwrap()..];
        assert!(exit[..exit.find("std::process::exit(0)").unwrap()].contains("local_models::stop_all();"));
    }

    /// A stand-in model library on a local port: metadata and two files.
    async fn library() -> String {
        library_with(300000, 300000, 0).await
    }

    /// The same library, whose model.safetensors (declared 300000 bytes) sends
    /// `sent` bytes under a `claimed` content-length, after `delay_ms`.
    async fn library_with(sent: usize, claimed: usize, delay_ms: u64) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 4096];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let path = req.split_whitespace().nth(1).unwrap_or("").to_string();
                    let body: Vec<u8> = if path.starts_with("/api/models/") {
                        br#"{"sha":"0123abcd","siblings":[{"rfilename":"config.json","size":2},{"rfilename":"model.safetensors","size":300000},{"rfilename":"gguf/big.gguf","size":999}]}"#.to_vec()
                    } else if path.ends_with("/config.json") {
                        b"{}".to_vec()
                    } else if path.ends_with("/model.safetensors") {
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                        let head = format!("HTTP/1.1 200 OK\r\ncontent-length: {claimed}\r\nconnection: close\r\n\r\n");
                        let _ = sock.write_all(head.as_bytes()).await;
                        let _ = sock.write_all(&vec![7u8; sent]).await;
                        return;
                    } else {
                        let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n").await;
                        return;
                    };
                    let head = format!("HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len());
                    let _ = sock.write_all(head.as_bytes()).await;
                    let _ = sock.write_all(&body).await;
                });
            }
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn a_download_lands_where_the_engine_reads_and_reports_bytes() {
        let endpoint = library().await;
        let tmp = tempfile::tempdir().unwrap();
        let mut seen = Vec::new();
        pull_into(&endpoint, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(false), |d, t| seen.push((d, t)))
            .await
            .unwrap();
        let snap = tmp.path().join("models--zenlm--zen-nano-0.6b/snapshots/0123abcd");
        assert_eq!(std::fs::read(snap.join("config.json")).unwrap(), b"{}");
        assert_eq!(std::fs::metadata(snap.join("model.safetensors")).unwrap().len(), 300000);
        assert!(!snap.join("gguf").exists(), "the GGUF copies are not fetched");
        assert_eq!(seen.first(), Some(&(0, 300002)));
        assert_eq!(seen.last(), Some(&(300002, 300002)));
        assert_eq!(list_cached(tmp.path()).len(), 1);
    }

    #[tokio::test]
    async fn a_cancelled_download_leaves_no_model_behind() {
        let endpoint = library().await;
        let tmp = tempfile::tempdir().unwrap();
        let err = pull_into(&endpoint, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(true), |_, _| {})
            .await
            .unwrap_err();
        assert_eq!(err, CANCELLED);
        assert!(list_cached(tmp.path()).is_empty());
        let snap = tmp.path().join("models--zenlm--zen-nano-0.6b/snapshots/0123abcd");
        assert!(walk(&snap).iter().all(|f| !f.to_string_lossy().ends_with(".part")));
    }

    #[tokio::test]
    async fn a_short_file_is_not_taken_for_a_whole_one() {
        // The server says 1000 bytes and sends them, but the library declared 300000.
        let endpoint = library_with(1000, 1000, 0).await;
        let tmp = tempfile::tempdir().unwrap();
        let err = pull_into(&endpoint, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(false), |_, _| {})
            .await
            .unwrap_err();
        assert!(err.contains("model.safetensors arrived incomplete (1000 of 300000 bytes)"), "{err}");
        assert!(list_cached(tmp.path()).is_empty());
        let snap = tmp.path().join("models--zenlm--zen-nano-0.6b/snapshots/0123abcd");
        assert!(!snap.join("model.safetensors").exists(), "a short file is never renamed into place");
    }

    #[tokio::test]
    async fn no_connection_is_said_in_words() {
        let tmp = tempfile::tempdir().unwrap();
        let err = pull_into("http://127.0.0.1:9", tmp.path(), "a/b", &AtomicBool::new(false), |_, _| {})
            .await
            .unwrap_err();
        assert!(err.contains("could not reach the model library"), "{err}");
    }
}
