use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    timestamp: String,
    level: String,
    target: String,
    message: String,
}

fn get_log_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let log_dir = app_handle.path().app_log_dir().map_err(|e| e.to_string())?;
    let product_name = app_handle
        .config()
        .product_name
        .clone()
        .unwrap_or("Hanzo Desktop".to_string());
    let log_file = format!("{}/{}.log", log_dir.display(), product_name);
    Ok(PathBuf::from(log_file))
}

#[tauri::command]
pub fn retrieve_logs(app_handle: tauri::AppHandle) -> Result<Vec<LogEntry>, String> {
    let log_file = get_log_file_path(&app_handle)?;

    let log_contents = match std::fs::read_to_string(log_file) {
        Ok(contents) => contents,
        Err(e) => {
            log::error!("Failed to read log file: {}", e);
            return Err("Failed to read log file".to_string());
        }
    };

    // Split log contents into lines and parse each line into a LogEntry
    let log_entries: Vec<LogEntry> = log_contents
        .split("　　　")
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            // Expected format: [timestamp][level][target] message
            let re = regex::Regex::new(r"\[(.*?)\]\[(.*?)\]\[(.*?)\] ((?s).*)").unwrap();
            if let Some(captures) = re.captures(line) {
                let timestamp = captures.get(1).unwrap().as_str().to_string();
                let level = captures.get(2).unwrap().as_str().to_string();
                let target = captures.get(3).unwrap().as_str().to_string();
                let message = captures.get(4).unwrap().as_str().trim().to_string();

                return Some(LogEntry {
                    timestamp,
                    level,
                    target,
                    message,
                });
            }
            None
        })
        .collect();

    Ok(log_entries)
}

/// Defense-in-depth for `download_logs`: confine the destination to the user's
/// home directory so a caller can't write the log dump to an arbitrary location
/// (path traversal / symlink escape). The target file does not exist yet, so we
/// canonicalize its parent directory (which must exist) — that resolves `..` and
/// symlinks — and require the result to stay under the canonicalized home dir.
/// Returns the validated absolute destination path.
fn validate_save_path(app_handle: &tauri::AppHandle, save_path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(save_path);

    let file_name = requested
        .file_name()
        .ok_or_else(|| "invalid save path: missing file name".to_string())?;

    let parent = requested
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "invalid save path: missing parent directory".to_string())?;

    // Canonicalize the (existing) parent dir to collapse `..`/symlinks.
    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "invalid save path: parent directory is not accessible".to_string())?;

    let home_dir = app_handle
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;

    if !canonical_parent.starts_with(&home_dir) {
        log::error!(
            "rejected logs download outside home dir: {}",
            canonical_parent.display()
        );
        return Err("save path must be inside your home directory".to_string());
    }

    Ok(canonical_parent.join(file_name))
}

#[tauri::command]
pub fn download_logs(app_handle: tauri::AppHandle, save_path: String) -> Result<String, String> {
    let log_file = get_log_file_path(&app_handle)?;
    let dest = validate_save_path(&app_handle, &save_path)?;

    match std::fs::copy(&log_file, &dest) {
        Ok(_) => Ok(dest.to_string_lossy().into_owned()),
        Err(e) => {
            log::error!(
                "failed to copy log file from {} to {}: {}",
                log_file.to_string_lossy(),
                dest.to_string_lossy(),
                e
            );
            return Err("failed to copy log file".to_string());
        }
    }
}
