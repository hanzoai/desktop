use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use futures_util::StreamExt;
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

fn say_setup(app: &tauri::AppHandle, percent: u8) {
    let _ = app.emit(SETUP_EVENT, serde_json::json!({ "percent": percent }));
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
    if let Err(e) = fetch_dev(app, &own_copy).await {
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
}

impl SetupError {
    fn plain(&self) -> String {
        match self {
            SetupError::Unsupported => "Hanzo Dev is not available for this kind of computer yet.".to_string(),
            SetupError::Network(_) => "Hanzo Dev could not be downloaded. Check your internet connection and try again.".to_string(),
            SetupError::Mismatch => "The download of Hanzo Dev did not check out, so it was not used. Try again.".to_string(),
            SetupError::Unpack(_) => "Hanzo Dev could not be set up on this computer. Try again.".to_string(),
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
        }
    }
}

/// Downloads the pinned release, checks it against the checksum published beside it, and unpacks the
/// one program it holds to `dest`. The download is 0-90%, checking and unpacking the rest.
async fn fetch_dev(app: &tauri::AppHandle, dest: &Path) -> Result<(), SetupError> {
    let asset = hanzo_dev_agent::here().ok_or(SetupError::Unsupported)?;
    let net = |e: reqwest::Error| SetupError::Network(e.to_string());
    let io = |e: std::io::Error| SetupError::Unpack(e.to_string());
    let client = reqwest::Client::new();
    say_setup(app, 0);

    let digest = client.get(asset.digest_url()).send().await.and_then(|r| r.error_for_status()).map_err(net)?.text().await.map_err(net)?;
    let expected = hanzo_dev_agent::expected(&digest).ok_or_else(|| SetupError::Network("no checksum published".to_string()))?;

    let dir = dest.parent().ok_or_else(|| SetupError::Unpack("no folder".to_string()))?;
    fs::create_dir_all(dir).map_err(io)?;
    let archive = dir.join(asset.name);
    let result = download_and_unpack(app, &client, &asset, &expected, &archive, dest).await;
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
    say_setup(app, 100);
    Ok(())
}

async fn download_and_unpack(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    asset: &hanzo_dev_agent::Asset,
    expected: &str,
    archive: &Path,
    dest: &Path,
) -> Result<(), SetupError> {
    let net = |e: reqwest::Error| SetupError::Network(e.to_string());
    let res = client.get(asset.url()).send().await.and_then(|r| r.error_for_status()).map_err(net)?;
    let total = res.content_length().unwrap_or(0);
    let mut file = fs::File::create(archive).map_err(|e| SetupError::Unpack(e.to_string()))?;
    let mut stream = res.bytes_stream();
    let (mut got, mut shown) = (0u64, 0u8);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(net)?;
        file.write_all(&chunk).map_err(|e| SetupError::Unpack(e.to_string()))?;
        got += chunk.len() as u64;
        if total > 0 {
            let percent = ((got * 90) / total).min(90) as u8;
            if percent != shown {
                shown = percent;
                say_setup(app, percent);
            }
        }
    }
    file.flush().map_err(|e| SetupError::Unpack(e.to_string()))?;
    drop(file);

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

/// The project folders found where people keep them (Documents, Projects, work, code, ...), newest first.
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
