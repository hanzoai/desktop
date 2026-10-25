use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, Deserialize)]
pub struct DevRunResult {
    pub session_id: String,
    pub output: String,
    pub success: bool,
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

#[tauri::command]
pub async fn local_workspace_run_dev(workspace_path: String, prompt: String) -> Result<DevRunResult, String> {
    let dev_bin = std::env::var("HANZO_DEV_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let user_home = dirs::home_dir().unwrap_or_default();
            let local_bin = user_home.join(".local/bin/dev");
            if local_bin.exists() {
                local_bin
            } else {
                let cargo_bin = user_home.join(".cargo/bin/dev");
                if cargo_bin.exists() {
                    cargo_bin
                } else {
                    PathBuf::from("dev")
                }
            }
        });

    let output = Command::new(&dev_bin)
        .arg("exec")
        .arg("--skip-git-repo-check")
        .arg("-C")
        .arg(&workspace_path)
        .arg(&prompt)
        .output()
        .map_err(|e| format!("Failed to invoke dev at {:?}: {}", dev_bin, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.is_empty() {
        stdout
    } else {
        format!("{}\n{}", stdout, stderr)
    };

    let session_id = format!("local_{}", uuid::Uuid::new_v4());
    Ok(DevRunResult {
        session_id,
        output: combined,
        success: output.status.success(),
    })
}
