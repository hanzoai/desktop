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
//! chooses it, and it is stopped when the app exits ([`stop_all`]). An exit
//! that runs no code (a crash, Force Quit, a kill) cannot stop it, so the
//! engine is recorded while it serves ([`EngineRecord`]) and the next start
//! ends it if it is still that engine ([`at_start`]).

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
/// Free disk a download must leave behind, so the computer keeps room for its
/// own work (swap, updates, the person's files) after a multi-gigabyte model.
pub const MIN_FREE_BYTES: u64 = 2_000_000_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Cached {
    pub repo: String,
    /// The model's files: what the engine loads.
    pub bytes: u64,
    /// Everything in its `models--org--name` folder, which is what Remove
    /// deletes: other snapshots and blobs another tool fetched into it too.
    pub folder_bytes: u64,
}

#[derive(Serialize)]
pub struct Status {
    /// The engine binary that serves models, or `None` when none is installed.
    pub engine: Option<String>,
    pub cache_dir: String,
    /// Models this app offers whose download finished.
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

/// The engine this app started, kept in the app's data folder while it serves:
/// its process id, and what tells it from another process that later got the
/// same id, its executable and its start time (seconds, as the system says).
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct EngineRecord {
    pub pid: u32,
    pub exe: PathBuf,
    pub started: u64,
}

/// The app's data folder, once `at_start` has been told it.
fn data_dir() -> &'static OnceLock<PathBuf> {
    static D: OnceLock<PathBuf> = OnceLock::new();
    &D
}

fn record_file() -> Option<PathBuf> {
    data_dir().get().map(|d| d.join("local-engine.json"))
}

/// What runs as `pid` now: its executable and start time, or `None` when no
/// process has that id (or its executable cannot be read, so it is not ours to end).
fn running_as(pid: u32) -> Option<(PathBuf, u64)> {
    let pid = sysinfo::Pid::from_u32(pid);
    let mut sys = sysinfo::System::new();
    sys.refresh_process(pid);
    sys.process(pid).and_then(|p| Some((p.exe()?.to_path_buf(), p.start_time())))
}

/// Whether the process now running under a recorded id is still the engine
/// this app started, and so is to be ended. Anything else (no process, another
/// program, another start of the same program) is left alone. The record goes
/// either way.
pub fn still_our_engine(record: &EngineRecord, now: Option<(PathBuf, u64)>) -> bool {
    now.is_some_and(|(exe, started)| exe == record.exe && started == record.started)
}

/// At start: end the engine an earlier run left serving, if it is still alive
/// and still that engine, then forget the record. Never by name.
fn end_left_engine(file: &Path) {
    let Some(record) = std::fs::read(file).ok().and_then(|b| serde_json::from_slice::<EngineRecord>(&b).ok()) else {
        let _ = std::fs::remove_file(file);
        return;
    };
    if still_our_engine(&record, running_as(record.pid)) {
        let pid = sysinfo::Pid::from_u32(record.pid);
        let mut sys = sysinfo::System::new();
        sys.refresh_process(pid);
        if sys.process(pid).is_some_and(|p| p.kill()) {
            log::info!("[local-models] ended the engine an earlier run left serving (pid {})", record.pid);
        }
    }
    let _ = std::fs::remove_file(file);
}

fn remember(child: &Child) {
    let Some(file) = record_file() else { return };
    let pid = child.id();
    // spawn returns after exec, so this is the engine and not the app.
    let Some((exe, started)) = running_as(pid) else { return };
    let record = EngineRecord { pid, exe, started };
    if let Err(e) = serde_json::to_vec(&record).map_err(|e| e.to_string()).and_then(|b| std::fs::write(&file, b).map_err(|e| e.to_string())) {
        log::warn!("[local-models] could not record the engine: {e}");
    }
}

fn forget() {
    if let Some(file) = record_file() {
        let _ = std::fs::remove_file(file);
    }
}

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

/// The models this app offers. The same file is the window's `LOCAL_SOURCES`
/// (src/lib/local-models.ts), so the two are one list. The commands are
/// reachable from any page the main window may load, so a repository the app
/// does not offer is refused here, not only left off the screen.
pub fn offered(repo: &str) -> bool {
    #[derive(Deserialize)]
    struct Source {
        repo: String,
    }
    static LIST: OnceLock<Vec<String>> = OnceLock::new();
    LIST.get_or_init(|| {
        serde_json::from_str::<Vec<Source>>(include_str!("../../src/lib/local-sources.json"))
            .expect("src/lib/local-sources.json is the offered model list")
            .into_iter()
            .map(|s| s.repo)
            .collect()
    })
    .iter()
    .any(|r| r == repo)
}

fn not_offered(repo: &str) -> String {
    format!("{repo} is not one of the models this app offers.")
}

/// Free bytes on the disk that holds `path`, or `None` when it cannot be read.
fn free_bytes(path: &Path) -> Option<u64> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .filter(|d| path.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
}

/// Whether `needed` more bytes fit and still leave [`MIN_FREE_BYTES`]. An
/// unreadable disk is not a reason to refuse.
pub fn room_for(needed: u64, free: Option<u64>) -> Result<(), String> {
    let gb = |b: u64| format!("{:.1} GB", b as f64 / 1e9);
    match free {
        Some(free) if free < needed.saturating_add(MIN_FREE_BYTES) => Err(format!(
            "This model needs {} and this computer has {} free. Downloading it would leave less than {}, so it was not started. Free some space and try again.",
            gb(needed),
            gb(free),
            gb(MIN_FREE_BYTES)
        )),
        _ => Ok(()),
    }
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
            (bytes > 0).then_some(Cached { repo, bytes, folder_bytes: folder_bytes(&e.path()) })
        })
        .collect();
    out.sort_by(|a, b| a.repo.cmp(&b.repo));
    out
}

/// The finished models this app offers. The Hugging Face cache is shared: on a
/// developer's machine it can hold huge or embedding models other tools
/// fetched. Only these count, for chat, Settings and the Local AI screen, so
/// chat never starts a model the person did not choose here.
pub fn installed(cache: &Path) -> Vec<Cached> {
    list_cached(cache).into_iter().filter(|c| offered(&c.repo)).collect()
}

/// The bytes `remove_dir_all(dir)` frees: every real file under it, once. A
/// link (a snapshot entry pointing at its blob) is not followed, so a blob is
/// not counted again through it, and nothing outside the folder is counted.
fn folder_bytes(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.path().symlink_metadata() {
            Ok(m) if m.is_dir() => folder_bytes(&e.path()),
            Ok(m) if m.is_file() => m.len(),
            _ => 0,
        })
        .sum()
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
    let still_needed: u64 = files
        .iter()
        .filter(|(f, size)| std::fs::metadata(snap.join(f)).map(|m| m.len()).ok() != Some(*size))
        .map(|(_, size)| size)
        .sum();
    room_for(still_needed, free_bytes(cache))?;
    std::fs::create_dir_all(&snap).map_err(|e| format!("Could not make the model folder: {e}"))?;

    let mut done = 0u64;
    let mut last = Instant::now();
    // Every file this download writes, so a failed or cancelled one can take
    // them back: none is listed until refs/main exists, so no Remove button
    // could ever reach them.
    let mut made: Vec<PathBuf> = Vec::new();
    progress(done, total);
    let fetched: Result<(), String> = async {
        for (file, size) in &files {
            let dest = snap.join(file);
            // A file already complete (a model downloaded before) is kept.
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
            made.push(part.clone());
            let mut out = std::fs::File::create(&part).map_err(|e| format!("Could not write {file}: {e}"))?;
            let mut stream = res.bytes_stream();
            let mut got = 0u64;
            loop {
                // A stalled connection must not hold a cancel up: the app's exit
                // waits for it (`cancel_and_wait`), so the flag is read at least
                // every 200 ms, not only when bytes arrive.
                let next = loop {
                    if cancel.load(Ordering::Relaxed) {
                        return Err(CANCELLED.into());
                    }
                    if let Ok(next) = tokio::time::timeout(Duration::from_millis(200), stream.next()).await {
                        break next;
                    }
                };
                let Some(chunk) = next else { break };
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
            made.push(dest.clone());
            std::fs::rename(&part, &dest).map_err(|e| format!("Could not finish {file}: {e}"))?;
        }
        let refs = root.join("refs");
        std::fs::create_dir_all(&refs).map_err(|e| e.to_string())?;
        std::fs::write(refs.join("main"), &meta.sha).map_err(|e| e.to_string())
    }
    .await;
    if fetched.is_err() {
        take_back(&made, &snap, &root);
    }
    fetched?;
    progress(done.max(total), done.max(total));
    Ok(())
}

/// Undo what a download that did not finish wrote: its files, then the folders
/// that leaves empty (`remove_dir` refuses one that is not). A model that was
/// complete before keeps its refs and its own files, so it is untouched.
fn take_back(made: &[PathBuf], snap: &Path, root: &Path) {
    for f in made {
        let _ = std::fs::remove_file(f);
    }
    for dir in [Some(snap), snap.parent(), Some(root)].into_iter().flatten() {
        let _ = std::fs::remove_dir(dir);
    }
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
    forget();
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
            forget();
        }
    }
}

/// The app is leaving: stop the model this app serves (nothing else on the
/// port) and call off a download. Every exit path ends the process right after
/// this, so it waits (bounded) for the download to take its files back.
pub fn stop_all() {
    stop_serving();
    cancel_and_wait(Duration::from_secs(2));
}

/// Calls the running download off and waits up to `limit` for it to end, which
/// is after `pull_into` has taken back what it wrote. True when none is left.
/// A download still running at `limit` is left to [`sweep_unfinished`] at the
/// next start.
fn cancel_and_wait(limit: Duration) -> bool {
    if !local_models_cancel() {
        return true;
    }
    let start = Instant::now();
    loop {
        if pulling().lock().map(|p| p.is_none()).unwrap_or(true) {
            return true;
        }
        if start.elapsed() >= limit {
            return false;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// Remove what a download that never finished left in `cache`: the folder of a
/// model this app offers that has no `refs/main`. Every download here writes
/// that last, so such a folder is one of this app's that was cut off (a quit,
/// a crash, a power cut) and that no screen lists. A folder with `refs/main` is
/// complete and kept, and so is any model this app does not offer, whatever
/// state it is in: the cache is shared with other tools. Returns what went.
pub fn sweep_unfinished(cache: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(cache) else { return Vec::new() };
    entries
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name.strip_prefix("models--").is_some_and(|r| offered(&r.replacen("--", "/", 1)))
                && e.file_type().is_ok_and(|t| t.is_dir())
                && !e.path().join("refs").join("main").exists()
        })
        .map(|e| e.path())
        .filter(|p| std::fs::remove_dir_all(p).is_ok())
        .collect()
}

/// At start, before any window can press Use: end an engine an earlier run
/// left serving (it would hold the port), then sweep its cut-off download.
pub fn at_start(data: PathBuf) {
    let _ = data_dir().set(data);
    if let Some(file) = record_file() {
        end_left_engine(&file);
    }
    std::thread::spawn(sweep_once);
}

/// Once per run, at start (and before the first status, should that come
/// first): sweep what an earlier run's cut-off download left, while nothing
/// downloads.
fn sweep_once() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        if pulling().lock().map(|p| p.is_some()).unwrap_or(true) {
            return;
        }
        for gone in sweep_unfinished(&this_cache_dir()) {
            log::info!("[local-models] removed an unfinished download: {}", gone.display());
        }
    });
}

#[tauri::command]
pub fn local_models_status() -> Status {
    sweep_once();
    let cache = this_cache_dir();
    let serving = alive();
    Status {
        engine: engine_bin().map(|p| p.to_string_lossy().into_owned()),
        installed: installed(&cache),
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
    if !offered(&repo) {
        return Err(not_offered(&repo));
    }
    let endpoint = std::env::var("HF_ENDPOINT").unwrap_or_else(|_| "https://huggingface.co".into());
    let result = pull(endpoint.trim_end_matches('/'), &this_cache_dir(), &repo, |done, total| {
        let _ = app.emit(PROGRESS_EVENT, Progress { repo: &repo, done, total });
    })
    .await;
    if let Err(e) = &result {
        log::info!("[local-models] download of {repo} ended: {e}");
    }
    result
}

/// The one download at a time: [`pull_into`] while it holds the slot that
/// cancel and exit see. The slot is freed only after the files are taken back.
async fn pull(endpoint: &str, cache: &Path, repo: &str, progress: impl FnMut(u64, u64)) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut p = pulling().lock().map_err(|e| e.to_string())?;
        if let Some((other, _)) = p.as_ref() {
            return Err(format!("{other} is still downloading. One download at a time."));
        }
        *p = Some((repo.to_string(), cancel.clone()));
    }
    let result = pull_into(endpoint, cache, repo, &cancel, progress).await;
    if let Ok(mut p) = pulling().lock() {
        *p = None;
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
    if !offered(&repo) {
        return Err(not_offered(&repo));
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
    if !offered(&repo) {
        return Err(not_offered(&repo));
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
    // Whatever answers now is not ours: a Hanzo engine left from before, or
    // another program. The new engine could not bind, and chat would talk to
    // that one while the screen named this model.
    if port_taken(PORT) {
        return Err(format!(
            "Another program on this computer is already using port {PORT}, where the model answers, so {repo} was not started. Quit that program (it may be a Hanzo engine left running), then press Use again."
        ));
    }
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
    remember(&child);
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

/// Whether something already listens on 127.0.0.1:`port`.
fn port_taken(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(&(std::net::Ipv4Addr::LOCALHOST, port).into(), Duration::from_millis(300)).is_ok()
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
    fn only_the_models_the_window_offers_can_be_fetched() {
        assert!(offered("zenlm/zen-nano-0.6b"));
        assert!(offered("Qwen/Qwen3-4B"));
        for other in ["meta-llama/Llama-3.1-405B", "sentence-transformers/all-MiniLM-L6-v2", "zenlm/zen-nano"] {
            assert!(!offered(other), "{other}");
        }
    }

    /// The ACL the app is built with (Tauri resolves the same files at run time):
    /// the window's own pages reach the model commands, a hanzo.ai page in the
    /// same window does not, while it still reaches what main.json grants.
    #[test]
    fn only_the_windows_own_pages_reach_the_model_commands() {
        use std::collections::BTreeMap;
        use tauri::utils::acl::{capability::Capability, manifest::Manifest, resolved::Resolved, ExecutionContext};
        let acl: BTreeMap<String, Manifest> =
            serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/acl-manifests.json"))).unwrap();
        let caps: BTreeMap<String, Capability> =
            serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/capabilities.json"))).unwrap();
        let resolved = Resolved::resolve(&acl, caps, tauri::utils::platform::Target::current()).unwrap();
        let main = |c: &tauri::utils::acl::resolved::ResolvedCommand| c.windows.iter().any(|w| w.matches("main"));
        for cmd in ["local_models_status", "local_models_pull", "local_models_cancel", "local_models_remove", "local_models_serve", "local_models_stop"] {
            let grants = &resolved.allowed_commands[cmd];
            assert!(grants.iter().any(|c| main(c) && c.context == ExecutionContext::Local), "{cmd}: the window's own page");
            assert!(grants.iter().all(|c| c.context == ExecutionContext::Local), "{cmd}: a remote page");
        }
        let other = &resolved.allowed_commands["hardware_get_summary"];
        assert!(other.iter().any(|c| main(c) && matches!(c.context, ExecutionContext::Remote { .. })));
    }

    #[test]
    fn a_port_someone_else_holds_is_seen() {
        let held = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = held.local_addr().unwrap().port();
        assert!(port_taken(port));
        drop(held);
        assert!(!port_taken(port));
    }

    #[test]
    fn a_download_must_leave_room_on_the_disk() {
        assert!(room_for(1_000_000_000, Some(10_000_000_000)).is_ok());
        assert!(room_for(1_000_000_000, None).is_ok(), "unreadable free space does not block");
        let err = room_for(8_000_000_000, Some(9_000_000_000)).unwrap_err();
        assert!(err.contains("needs 8.0 GB and this computer has 9.0 GB free"), "{err}");
        assert!(err.contains("less than 2.0 GB"), "{err}");
        // This computer's own disk is readable.
        assert!(free_bytes(&std::env::temp_dir()).is_some());
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
        assert_eq!(list_cached(tmp.path()), vec![Cached { repo: "zenlm/zen-nano-0.6b".into(), bytes: 6, folder_bytes: 6 + 3 }]);
        // No refs/main: the download never got to the end.
        std::fs::create_dir_all(tmp.path().join("models--Qwen--Qwen3-0.6B/snapshots/x")).unwrap();
        assert_eq!(list_cached(tmp.path()).len(), 1);
    }

    #[test]
    fn another_tools_model_in_the_shared_cache_is_not_ours() {
        let tmp = tempfile::tempdir().unwrap();
        for repo in ["zenlm--zen-nano-0.6b", "sentence-transformers--all-MiniLM-L6-v2"] {
            let root = tmp.path().join(format!("models--{repo}"));
            std::fs::create_dir_all(root.join("snapshots/abc")).unwrap();
            std::fs::write(root.join("snapshots/abc/model.safetensors"), b"w").unwrap();
            std::fs::create_dir_all(root.join("refs")).unwrap();
            std::fs::write(root.join("refs/main"), "abc").unwrap();
        }
        assert_eq!(list_cached(tmp.path()).len(), 2);
        assert_eq!(installed(tmp.path()), vec![Cached { repo: "zenlm/zen-nano-0.6b".into(), bytes: 1, folder_bytes: 1 + 3 }]);
    }

    /// Remove deletes the whole folder, so that is the size it names: blobs and
    /// other snapshots another tool fetched, each real file once, links not followed.
    #[cfg(unix)]
    #[test]
    fn remove_names_everything_it_deletes() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("models--zenlm--zen-nano-0.6b");
        // This app's snapshot: real files.
        std::fs::create_dir_all(root.join("snapshots/abc")).unwrap();
        std::fs::write(root.join("snapshots/abc/model.safetensors"), vec![0u8; 100]).unwrap();
        std::fs::create_dir_all(root.join("refs")).unwrap();
        std::fs::write(root.join("refs/main"), "abc").unwrap();
        // Another tool's: a 1000-byte blob, linked from its snapshot twice.
        std::fs::create_dir_all(root.join("blobs")).unwrap();
        std::fs::write(root.join("blobs/f00d"), vec![0u8; 1000]).unwrap();
        std::fs::create_dir_all(root.join("snapshots/def")).unwrap();
        std::os::unix::fs::symlink("../../blobs/f00d", root.join("snapshots/def/model.gguf")).unwrap();
        std::os::unix::fs::symlink("../../blobs/f00d", root.join("snapshots/def/copy.gguf")).unwrap();
        // A link out of the folder is not counted: remove_dir_all does not follow it.
        std::fs::write(tmp.path().join("outside"), vec![0u8; 5000]).unwrap();
        std::os::unix::fs::symlink(tmp.path().join("outside"), root.join("snapshots/def/out")).unwrap();
        let got = &installed(tmp.path())[0];
        assert_eq!(got.bytes, 100, "the model this app downloaded");
        assert_eq!(got.folder_bytes, 100 + 3 + 1000, "what Remove deletes");
    }

    #[test]
    fn a_left_engine_is_ended_only_while_it_is_still_that_engine() {
        let record = EngineRecord { pid: 4242, exe: "/Users/a/.local/bin/hanzo-engine".into(), started: 1_700_000_000 };
        let now = |exe: &str, started| Some((PathBuf::from(exe), started));
        assert!(still_our_engine(&record, now("/Users/a/.local/bin/hanzo-engine", 1_700_000_000)), "alive and the same engine: end it");
        assert!(!still_our_engine(&record, now("/Applications/Safari.app/Contents/MacOS/Safari", 1_700_000_000)), "another program: leave it");
        assert!(!still_our_engine(&record, now("/Users/a/.local/bin/hanzo-engine", 1_700_000_900)), "a later start of the engine: leave it");
        assert!(!still_our_engine(&record, None), "gone: nothing to end");
    }

    #[cfg(unix)]
    #[test]
    fn at_start_the_record_is_cleared_and_only_the_recorded_process_is_ended() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("local-engine.json");
        // A live process recorded as itself: what a crash leaves behind.
        let mut ours = Command::new("sleep").arg("30").spawn().unwrap();
        let (exe, started) = running_as(ours.id()).expect("a live process is seen");
        std::fs::write(&file, serde_json::to_vec(&EngineRecord { pid: ours.id(), exe, started }).unwrap()).unwrap();
        end_left_engine(&file);
        assert!(ours.wait().is_ok_and(|s| !s.success()), "the recorded engine was ended");
        assert!(!file.exists());
        // A live process whose id is recorded under another executable is left alone.
        let mut other = Command::new("sleep").arg("30").spawn().unwrap();
        std::fs::write(&file, serde_json::to_vec(&EngineRecord { pid: other.id(), exe: "/nowhere/hanzo-engine".into(), started: 0 }).unwrap()).unwrap();
        end_left_engine(&file);
        assert!(matches!(other.try_wait(), Ok(None)), "another program keeps running");
        assert!(!file.exists());
        let _ = other.kill();
        let _ = other.wait();
    }

    /// The tests that touch the one download slot and the served engine take turns.
    static GLOBALS: Mutex<()> = Mutex::new(());

    #[cfg(unix)]
    #[test]
    fn leaving_the_app_ends_the_served_engine() {
        let _turn = GLOBALS.lock().unwrap_or_else(|e| e.into_inner());
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
        library_with(300000, 300000, 0, 0).await
    }

    /// The same library, whose model.safetensors (declared 300000 bytes) sends
    /// `sent` bytes under a `claimed` content-length, after `delay_ms`, then holds
    /// the connection open for `hold_ms` before closing it.
    async fn library_with(sent: usize, claimed: usize, delay_ms: u64, hold_ms: u64) -> String {
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
                        tokio::time::sleep(Duration::from_millis(hold_ms)).await;
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
        assert!(!tmp.path().join("models--zenlm--zen-nano-0.6b").exists(), "nothing is left behind");
    }

    #[tokio::test]
    async fn cancel_after_one_file_finished_takes_that_file_back_too() {
        // config.json arrives at once; model.safetensors waits, so the progress
        // report that fires on its first bytes is where Cancel is pressed.
        let endpoint = library_with(300000, 300000, 300, 0).await;
        let tmp = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let err = pull_into(&endpoint, tmp.path(), "zenlm/zen-nano-0.6b", &cancel, |done, _| {
            if done > 2 {
                cancel.store(true, Ordering::Relaxed);
            }
        })
        .await
        .unwrap_err();
        assert_eq!(err, CANCELLED);
        assert!(!tmp.path().join("models--zenlm--zen-nano-0.6b").exists(), "the finished config.json went too");
    }

    #[tokio::test]
    async fn a_dropped_connection_leaves_nothing_nobody_can_see() {
        // The connection closes 1000 bytes into a 300000-byte file.
        let endpoint = library_with(1000, 300000, 0, 0).await;
        let tmp = tempfile::tempdir().unwrap();
        let err = pull_into(&endpoint, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(false), |_, _| {})
            .await
            .unwrap_err();
        assert!(err.starts_with("The download stopped"), "{err}");
        assert!(!tmp.path().join("models--zenlm--zen-nano-0.6b").exists(), "no .part and no finished file left");
    }

    #[tokio::test]
    async fn a_failed_download_never_touches_a_model_that_was_already_complete() {
        let tmp = tempfile::tempdir().unwrap();
        pull_into(&library().await, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(false), |_, _| {})
            .await
            .unwrap();
        let root = tmp.path().join("models--zenlm--zen-nano-0.6b");
        // Make the weights look unfinished so the second download fetches them again, and fails.
        std::fs::write(root.join("snapshots/0123abcd/model.safetensors"), b"old").unwrap();
        let err = pull_into(&library_with(1000, 300000, 0, 0).await, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(false), |_, _| {})
            .await
            .unwrap_err();
        assert!(err.starts_with("The download stopped"), "{err}");
        assert_eq!(std::fs::read_to_string(root.join("refs/main")).unwrap(), "0123abcd");
        assert_eq!(std::fs::read(root.join("snapshots/0123abcd/config.json")).unwrap(), b"{}");
        assert_eq!(std::fs::read(root.join("snapshots/0123abcd/model.safetensors")).unwrap(), b"old");
        assert!(!root.join("snapshots/0123abcd/model.safetensors.part").exists());
    }

    #[tokio::test]
    async fn a_short_file_is_not_taken_for_a_whole_one() {
        // The server says 1000 bytes and sends them, but the library declared 300000.
        let endpoint = library_with(1000, 1000, 0, 0).await;
        let tmp = tempfile::tempdir().unwrap();
        let err = pull_into(&endpoint, tmp.path(), "zenlm/zen-nano-0.6b", &AtomicBool::new(false), |_, _| {})
            .await
            .unwrap_err();
        assert!(err.contains("model.safetensors arrived incomplete (1000 of 300000 bytes)"), "{err}");
        assert!(list_cached(tmp.path()).is_empty());
        let snap = tmp.path().join("models--zenlm--zen-nano-0.6b/snapshots/0123abcd");
        assert!(!snap.join("model.safetensors").exists(), "a short file is never renamed into place");
    }

    /// A cache with one model folder: `complete` writes refs/main, else it is a
    /// download cut off with a .part file.
    fn model_folder(cache: &Path, repo: &str, complete: bool) -> PathBuf {
        let root = cache.join(repo_folder(repo));
        let snap = root.join("snapshots/abc");
        std::fs::create_dir_all(&snap).unwrap();
        if complete {
            std::fs::write(snap.join("model.safetensors"), b"w").unwrap();
            std::fs::create_dir_all(root.join("refs")).unwrap();
            std::fs::write(root.join("refs/main"), "abc").unwrap();
        } else {
            std::fs::write(snap.join("model.safetensors.part"), b"half").unwrap();
        }
        root
    }

    #[test]
    fn at_start_an_unfinished_download_of_ours_is_removed_and_nothing_else() {
        let tmp = tempfile::tempdir().unwrap();
        let cut_off = model_folder(tmp.path(), "zenlm/zen-nano-0.6b", false);
        let complete = model_folder(tmp.path(), "Qwen/Qwen3-4B", true);
        let not_ours = model_folder(tmp.path(), "sentence-transformers/all-MiniLM-L6-v2", false);
        assert_eq!(sweep_unfinished(tmp.path()), vec![cut_off.clone()]);
        assert!(!cut_off.exists(), "an offered model with no refs/main goes");
        assert!(complete.join("snapshots/abc/model.safetensors").exists(), "a complete offered model stays");
        assert!(not_ours.join("snapshots/abc/model.safetensors.part").exists(), "another tool's download stays");
        assert!(sweep_unfinished(&tmp.path().join("missing")).is_empty());
    }

    /// Quit mid-download: the exit path cancels and waits, and by the time it
    /// returns the partial files are gone, even while the connection is stalled.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn quitting_mid_download_takes_the_partial_files_back() {
        // 1000 bytes of the weights, then a connection that stays silent for 30 s.
        let _turn = GLOBALS.lock().unwrap_or_else(|e| e.into_inner());
        let endpoint = library_with(1000, 300000, 0, 30_000).await;
        let tmp = tempfile::tempdir().unwrap();
        let cache = tmp.path().to_path_buf();
        let task = tokio::spawn(async move { pull(&endpoint, &cache, "zenlm/zen-nano-0.6b", |_, _| {}).await });
        let root = tmp.path().join("models--zenlm--zen-nano-0.6b");
        let part = root.join("snapshots/0123abcd/model.safetensors.part");
        for _ in 0..200 {
            if std::fs::metadata(&part).is_ok_and(|m| m.len() == 1000) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(part.exists(), "the download is under way");
        let ended = tokio::task::spawn_blocking(|| cancel_and_wait(Duration::from_secs(2))).await.unwrap();
        assert!(ended, "the download ended within the wait");
        assert!(!root.exists(), "no partial file is left behind");
        assert_eq!(task.await.unwrap().unwrap_err(), CANCELLED);
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
