use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use futures_util::{Stream, StreamExt};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub last_modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalWorkspaceInfo {
    pub name: String,
    pub path: String,
}

/// What a run in a folder answers with: the agent's final message (`output`), what it did on the way
/// (`process`, its log), and whether it finished. The app shows the answer, and the process only to
/// someone who turned Developer mode on.
#[derive(Debug, Serialize, Deserialize)]
pub struct DevRunResult {
    pub session_id: String,
    pub output: String,
    pub process: String,
    pub success: bool,
}

/// A project folder found on this computer, for Auto to pick from. `modified` is ms since the epoch.
#[derive(Debug, Serialize, Deserialize)]
pub struct LocalFolder {
    pub name: String,
    pub path: String,
    pub modified: u64,
}

/// The event the window hears while Hanzo Dev is fetched: `{ "percent": 0..100 }`.
const SETUP_EVENT: &str = "local-dev-setup";

/// One fetch at a time: a second run that needs the agent waits for the first run's download.
static SETUP: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));

/// What the person is told when they call the download off. `local_workspace_run_dev` answers with exactly this.
pub const SETUP_CANCELLED: &str = "Setup was cancelled.";

/// The first-run download in flight, if any: what `local_dev_setup_cancel` reaches.
static CURRENT: Lazy<Mutex<Option<Arc<Setup>>>> = Lazy::new(|| Mutex::new(None));

/// One first-run download, and the way to call it off. Cancelling stops the request or the stream at once
/// (every wait on the network also waits on this), and once the download is whole there is nothing left to cancel:
/// checking and unpacking are local and quick.
struct Setup {
    off: tokio::sync::watch::Sender<bool>,
    whole: AtomicBool,
}

impl Setup {
    fn new() -> Arc<Setup> {
        Arc::new(Setup { off: tokio::sync::watch::channel(false).0, whole: AtomicBool::new(false) })
    }

    /// Calls the download off. False when it was already whole (or already off): there was nothing to stop.
    fn cancel(&self) -> bool {
        if self.whole.load(Ordering::SeqCst) || self.is_cancelled() {
            return false;
        }
        self.off.send_replace(true);
        true
    }

    fn is_cancelled(&self) -> bool {
        *self.off.borrow()
    }

    /// The download is all here: from now on a cancel finds nothing to stop.
    fn finished(&self) {
        self.whole.store(true, Ordering::SeqCst);
    }

    async fn called_off(&self) {
        let mut seen = self.off.subscribe();
        loop {
            if *seen.borrow_and_update() {
                return;
            }
            if seen.changed().await.is_err() {
                std::future::pending::<()>().await;
            }
        }
    }

    /// Waits for `step`, unless the download is called off first (then `Cancelled`, and `step` is dropped).
    async fn or_off<T>(&self, step: impl std::future::Future<Output = T>) -> Result<T, SetupError> {
        tokio::select! {
            biased;
            _ = self.called_off() => Err(SetupError::Cancelled),
            out = step => Ok(out),
        }
    }
}

/// Calls off the first-run download of Hanzo Dev. Answers whether one was in flight: false means there was none,
/// or it had already arrived. The run that was waiting on it fails with "Setup was cancelled.", the partial file
/// is removed, and the window hears no more of `local-dev-setup`.
#[tauri::command]
pub fn local_dev_setup_cancel() -> bool {
    CURRENT.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|setup| setup.cancel())
}

#[tauri::command]
pub async fn local_workspace_open_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let path_str = folder.map(|f| f.to_string());
        let _ = tx.send(path_str);
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_file(move |file| {
        let path_str = file.map(|f| f.to_string());
        let _ = tx.send(path_str);
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_clone_repo(repo: String, target_dir: Option<String>) -> Result<LocalWorkspaceInfo, String> {
    let clean_repo = repo.trim().to_string();
    if clean_repo.is_empty() {
        return Err("Repository cannot be empty".to_string());
    }

    let url = if clean_repo.starts_with("http://") || clean_repo.starts_with("https://") || clean_repo.starts_with("git@") {
        clean_repo.clone()
    } else {
        format!("https://github.com/{}.git", clean_repo)
    };

    let repo_name = clean_repo
        .split('/')
        .last()
        .unwrap_or("repo")
        .trim_end_matches(".git")
        .to_string();

    let dest = match target_dir {
        Some(d) => PathBuf::from(d),
        None => {
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join("HanzoWorkspaces").join(&repo_name)
        }
    };

    if dest.exists() {
        return Ok(LocalWorkspaceInfo {
            name: repo_name,
            path: dest.to_string_lossy().to_string(),
        });
    }

    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let output = Command::new("git")
        .arg("clone")
        .arg(&url)
        .arg(&dest)
        .output()
        .map_err(|e| format!("Failed to invoke git: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git clone failed: {}", err));
    }

    Ok(LocalWorkspaceInfo {
        name: repo_name,
        path: dest.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn local_workspace_import_file(source_path: String, target_dir: String) -> Result<LocalEntry, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }
    let file_name = src.file_name().ok_or("Invalid source file name")?;
    let dest = Path::new(&target_dir).join(file_name);
    fs::copy(src, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
    let metadata = fs::metadata(&dest).map_err(|e| e.to_string())?;
    Ok(LocalEntry {
        name: file_name.to_string_lossy().to_string(),
        path: dest.to_string_lossy().to_string(),
        is_dir: false,
        size: metadata.len(),
        last_modified: metadata.modified().ok().and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs())
        }),
    })
}

#[tauri::command]
pub async fn local_workspace_list(dir_path: String) -> Result<Vec<LocalEntry>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", dir_path));
    }

    let read_dir = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".git" {
            continue;
        }

        let entry_path = entry.path();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let last_modified = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        entries.push(LocalEntry {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
            last_modified,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn local_workspace_read_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {}: {}", file_path, e))
}

#[tauri::command]
pub async fn local_workspace_write_file(file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content.as_bytes()).map_err(|e| format!("Failed to write {}: {}", file_path, e))
}

#[tauri::command]
pub async fn local_workspace_create_file(file_path: String, content: Option<String>) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content.unwrap_or_default().as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_create_dir(dir_path: String) -> Result<(), String> {
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

/// Where the app keeps what it fetched.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Tells the window how far the download has come, unless it was called off (then it hears nothing more).
fn say_setup(app: &tauri::AppHandle, setup: &Setup, percent: u8) {
    if !setup.is_cancelled() {
        let _ = app.emit(SETUP_EVENT, serde_json::json!({ "percent": percent }));
    }
}

/// The agent a run uses: the computer's own `dev` when it has one, else the copy the app fetched.
fn found_dev(own_copy: &Path) -> Option<PathBuf> {
    hanzo_dev_agent::resolve(
        std::env::var_os(hanzo_dev_agent::OVERRIDE_VAR).as_deref(),
        dirs::home_dir().as_deref(),
        own_copy,
        std::env::var_os("PATH").as_deref(),
    )
}

/// The agent to run, fetching Hanzo Dev first when the computer has none: no terminal, no install step
/// for the person to find. The window hears `local-dev-setup` while it downloads.
async fn dev_bin(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data = data_dir(app)?;
    let own_copy = hanzo_dev_agent::own(&data);
    if let Some(bin) = found_dev(&own_copy) {
        return Ok(bin);
    }
    let _one_at_a_time = SETUP.lock().await;
    if let Some(bin) = found_dev(&own_copy) {
        return Ok(bin);
    }
    let setup = Setup::new();
    *CURRENT.lock().unwrap_or_else(|e| e.into_inner()) = Some(setup.clone());
    let fetched = fetch_dev(app, &own_copy, &setup).await;
    *CURRENT.lock().unwrap_or_else(|e| e.into_inner()) = None;
    if let Err(e) = fetched {
        log::warn!("Hanzo Dev setup failed: {e}");
        return Err(e.plain());
    }
    Ok(own_copy)
}

/// Why Hanzo Dev could not be set up. `plain` is what the person reads; `Display` is the log's.
#[derive(Debug)]
enum SetupError {
    Unsupported,
    Network(String),
    Mismatch,
    Unpack(String),
    Cancelled,
}

impl SetupError {
    fn plain(&self) -> String {
        match self {
            SetupError::Unsupported => "Hanzo Dev is not available for this kind of computer yet.".to_string(),
            SetupError::Network(_) => "Hanzo Dev could not be downloaded. Check your internet connection and try again.".to_string(),
            SetupError::Mismatch => "The download of Hanzo Dev did not check out, so it was not used. Try again.".to_string(),
            SetupError::Unpack(_) => "Hanzo Dev could not be set up on this computer. Try again.".to_string(),
            SetupError::Cancelled => SETUP_CANCELLED.to_string(),
        }
    }
}

impl std::fmt::Display for SetupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SetupError::Unsupported => write!(f, "no release for this computer"),
            SetupError::Network(why) => write!(f, "download failed: {why}"),
            SetupError::Mismatch => write!(f, "checksum mismatch"),
            SetupError::Unpack(why) => write!(f, "unpack failed: {why}"),
            SetupError::Cancelled => write!(f, "called off by the person"),
        }
    }
}

/// Downloads the pinned release, checks it against the checksum published beside it, and unpacks the
/// one program it holds to `dest`. The download is 0-90%, checking and unpacking the rest. Called off, it
/// stops where it is and the partly downloaded file goes.
async fn fetch_dev(app: &tauri::AppHandle, dest: &Path, setup: &Setup) -> Result<(), SetupError> {
    let asset = hanzo_dev_agent::here().ok_or(SetupError::Unsupported)?;
    let net = |e: reqwest::Error| SetupError::Network(e.to_string());
    let io = |e: std::io::Error| SetupError::Unpack(e.to_string());
    let client = reqwest::Client::new();
    say_setup(app, setup, 0);

    let digest = setup
        .or_off(async { client.get(asset.digest_url()).send().await?.error_for_status()?.text().await })
        .await?
        .map_err(net)?;
    let expected = hanzo_dev_agent::expected(&digest).ok_or_else(|| SetupError::Network("no checksum published".to_string()))?;

    let dir = dest.parent().ok_or_else(|| SetupError::Unpack("no folder".to_string()))?;
    fs::create_dir_all(dir).map_err(io)?;
    let archive = dir.join(asset.name);
    let result = download_and_unpack(app, setup, &client, &asset, &expected, &archive, dest).await;
    let _ = fs::remove_file(&archive);
    result?;

    // Older pins are let go once the pinned one is in place.
    if let Some(all) = dir.parent() {
        for old in fs::read_dir(all).into_iter().flatten().flatten() {
            if old.path() != dir {
                let _ = fs::remove_dir_all(old.path());
            }
        }
    }
    say_setup(app, setup, 100);
    Ok(())
}

/// Writes a download to `file` as it arrives, calling `progress` with each new whole percent (of `total`, scaled
/// to 90). Called off, it stops at the next wait and writes no more.
async fn copy_stream<S, B, E>(
    setup: &Setup,
    stream: S,
    total: u64,
    file: &mut impl Write,
    mut progress: impl FnMut(u8),
) -> Result<(), SetupError>
where
    S: Stream<Item = Result<B, E>>,
    B: AsRef<[u8]>,
    E: std::fmt::Display,
{
    let mut stream = Box::pin(stream);
    let (mut got, mut shown) = (0u64, 0u8);
    while let Some(chunk) = setup.or_off(stream.next()).await? {
        let chunk = chunk.map_err(|e| SetupError::Network(e.to_string()))?;
        file.write_all(chunk.as_ref()).map_err(|e| SetupError::Unpack(e.to_string()))?;
        got += chunk.as_ref().len() as u64;
        if total > 0 {
            let percent = ((got * 90) / total).min(90) as u8;
            if percent != shown {
                shown = percent;
                progress(percent);
            }
        }
    }
    file.flush().map_err(|e| SetupError::Unpack(e.to_string()))
}

async fn download_and_unpack(
    app: &tauri::AppHandle,
    setup: &Setup,
    client: &reqwest::Client,
    asset: &hanzo_dev_agent::Asset,
    expected: &str,
    archive: &Path,
    dest: &Path,
) -> Result<(), SetupError> {
    let net = |e: reqwest::Error| SetupError::Network(e.to_string());
    let res = setup
        .or_off(async { client.get(asset.url()).send().await?.error_for_status() })
        .await?
        .map_err(net)?;
    let total = res.content_length().unwrap_or(0);
    let mut file = fs::File::create(archive).map_err(|e| SetupError::Unpack(e.to_string()))?;
    copy_stream(setup, res.bytes_stream(), total, &mut file, |percent| say_setup(app, setup, percent)).await?;
    drop(file);
    setup.finished();

    let (archive, dest, expected, kind) = (archive.to_path_buf(), dest.to_path_buf(), expected.to_string(), asset.kind);
    tokio::task::spawn_blocking(move || {
        if !hanzo_dev_agent::verify(&archive, &expected).map_err(|e| SetupError::Unpack(e.to_string()))? {
            return Err(SetupError::Mismatch);
        }
        hanzo_dev_agent::unpack(&archive, kind, &dest).map_err(|e| SetupError::Unpack(e.to_string()))
    })
    .await
    .map_err(|e| SetupError::Unpack(e.to_string()))?
}

#[tauri::command]
pub async fn local_workspace_run_dev(app: tauri::AppHandle, workspace_path: String, prompt: String) -> Result<DevRunResult, String> {
    if !Path::new(&workspace_path).is_dir() {
        return Err(format!("The folder {workspace_path} is not on this computer any more. Choose another folder."));
    }
    let dev = dev_bin(&app).await?;
    let last = std::env::temp_dir().join(format!("hanzo-dev-{}.txt", uuid::Uuid::new_v4()));
    let (bin, folder, said, last_message) = (dev, workspace_path, prompt, last.clone());
    let output = tokio::task::spawn_blocking(move || {
        let mut run = Command::new(bin);
        // The agent works in the folder and nowhere else (workspace-write), with no colour codes in what it
        // prints, and its final message in a file of its own. `--` keeps a prompt that starts with a dash
        // from being read as an option.
        run.args(["exec", "--color", "never", "--skip-git-repo-check", "-s", "workspace-write", "-C"])
            .arg(&folder)
            .arg("-o")
            .arg(&last_message)
            .arg("--")
            .arg(&said)
            .stdin(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            run.creation_flags(0x0800_0000);
        }
        run.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Hanzo Dev could not start on this computer: {e}"))?;

    let final_message = fs::read_to_string(&last).ok();
    let _ = fs::remove_file(&last);
    let outcome = hanzo_dev_agent::outcome(
        final_message.as_deref(),
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    );
    Ok(DevRunResult {
        session_id: format!("local_{}", uuid::Uuid::new_v4()),
        output: outcome.output,
        process: outcome.process,
        success: output.status.success(),
    })
}

/// The project folders found where people keep them (~/code, ~/dev, ~/src, ~/Projects, ~/work, ~/git), newest first.
/// Auto picks from these and from the folders Hanzo opened.
#[tauri::command]
pub async fn local_workspace_discover() -> Result<Vec<LocalFolder>, String> {
    let Some(home) = dirs::home_dir() else {
        return Ok(Vec::new());
    };
    tokio::task::spawn_blocking(move || {
        hanzo_projects::discover(&home)
            .into_iter()
            .map(|p| LocalFolder { name: p.name, path: p.path.to_string_lossy().into_owned(), modified: p.modified })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicUsize;

    use futures_util::stream;

    use super::*;

    fn chunks(n: usize, size: usize) -> impl Stream<Item = Result<Vec<u8>, std::io::Error>> {
        stream::iter((0..n).map(move |i| Ok(vec![i as u8; size])))
    }

    #[tokio::test]
    async fn a_download_is_written_whole_and_its_progress_said_as_whole_percent_to_ninety() {
        let setup = Setup::new();
        let mut file = Vec::new();
        let mut said = Vec::new();
        copy_stream(&setup, chunks(4, 25), 100, &mut file, |p| said.push(p)).await.unwrap();
        assert_eq!(file.len(), 100);
        assert_eq!(said, [22, 45, 67, 90]);
    }

    #[tokio::test]
    async fn a_download_of_unknown_size_says_no_progress() {
        let setup = Setup::new();
        let mut file = Vec::new();
        let mut said = Vec::new();
        copy_stream(&setup, chunks(3, 10), 0, &mut file, |p| said.push(p)).await.unwrap();
        assert_eq!(file.len(), 30);
        assert!(said.is_empty());
    }

    #[tokio::test]
    async fn a_broken_connection_is_a_network_error() {
        let setup = Setup::new();
        let mut file = Vec::new();
        let broken = stream::iter(vec![Ok(vec![1u8; 4]), Err(std::io::Error::other("reset"))]);
        let err = copy_stream(&setup, broken, 100, &mut file, |_| {}).await.unwrap_err();
        assert!(matches!(err, SetupError::Network(_)), "{err}");
        assert_eq!(file.len(), 4);
    }

    #[tokio::test]
    async fn calling_it_off_mid_download_stops_it_at_once_and_writes_and_says_no_more() {
        let setup = Setup::new();
        let said = Arc::new(AtomicUsize::new(0));
        let arrived = Arc::new(tokio::sync::Notify::new());
        // Two chunks arrive, then the connection goes quiet for good.
        let quiet = stream::iter(vec![Ok::<_, std::io::Error>(vec![7u8; 30]), Ok(vec![7u8; 30])]).chain(stream::pending());
        let run = {
            let (setup, said, arrived) = (setup.clone(), said.clone(), arrived.clone());
            tokio::spawn(async move {
                let mut file = Vec::new();
                let out = copy_stream(&setup, quiet, 100, &mut file, |_| {
                    if said.fetch_add(1, Ordering::SeqCst) == 1 {
                        arrived.notify_one();
                    }
                })
                .await;
                (out, file.len())
            })
        };
        arrived.notified().await;
        assert!(setup.cancel(), "a download in flight is called off");
        let (out, written) = tokio::time::timeout(std::time::Duration::from_secs(5), run).await.expect("stops at once").unwrap();
        assert!(matches!(out, Err(SetupError::Cancelled)));
        assert_eq!(written, 60, "what had arrived stays; nothing arrives after");
        assert_eq!(said.load(Ordering::SeqCst), 2, "no progress after the cancel");
        assert!(setup.is_cancelled());
    }

    #[tokio::test]
    async fn a_download_called_off_before_it_starts_says_nothing() {
        let setup = Setup::new();
        assert!(setup.cancel());
        let mut file = Vec::new();
        let mut said = 0;
        let out = copy_stream(&setup, chunks(5, 20), 100, &mut file, |_| said += 1).await;
        assert!(matches!(out, Err(SetupError::Cancelled)));
        assert!(file.is_empty());
        assert_eq!(said, 0);
    }

    #[tokio::test]
    async fn a_request_waiting_on_the_network_is_dropped_when_called_off() {
        let setup = Setup::new();
        let waiting = {
            let setup = setup.clone();
            tokio::spawn(async move { setup.or_off(std::future::pending::<()>()).await })
        };
        tokio::task::yield_now().await;
        assert!(setup.cancel());
        let out = tokio::time::timeout(std::time::Duration::from_secs(5), waiting).await.expect("stops at once").unwrap();
        assert!(matches!(out, Err(SetupError::Cancelled)));
    }

    #[test]
    fn there_is_nothing_to_call_off_once_the_download_is_whole_or_already_off() {
        let whole = Setup::new();
        whole.finished();
        assert!(!whole.cancel());
        assert!(!whole.is_cancelled());
        let off = Setup::new();
        assert!(off.cancel());
        assert!(!off.cancel(), "a second cancel finds nothing to stop");
    }

    #[test]
    fn the_command_says_false_when_no_download_is_in_flight() {
        assert!(!local_dev_setup_cancel());
    }

    #[test]
    fn a_cancelled_run_is_told_exactly_that() {
        assert_eq!(SETUP_CANCELLED, "Setup was cancelled.");
        assert_eq!(SetupError::Cancelled.plain(), "Setup was cancelled.");
    }
}
