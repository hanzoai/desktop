use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightAppEntry {
    pub name: String,
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightClipboardEntry {
    pub id: u64,
    pub text: String,
    pub captured_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightSystemAction {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub category: String,
    pub keywords: Vec<String>,
}

pub struct ClipboardHistoryState {
    entries: Arc<Mutex<Vec<SpotlightClipboardEntry>>>,
}

impl ClipboardHistoryState {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn spawn_watcher(&self) {
        #[cfg(target_os = "macos")]
        {
            let entries = Arc::clone(&self.entries);
            tauri::async_runtime::spawn(async move {
                let mut next_id: u64 = 1;
                let mut last_seen = String::new();
                loop {
                    if let Ok(out) = tokio::process::Command::new("pbpaste").output().await {
                        if out.status.success() {
                            let text = String::from_utf8_lossy(&out.stdout).to_string();
                            let trimmed = text.trim();
                            if !trimmed.is_empty() && trimmed.len() <= 20_000 && text != last_seen {
                                last_seen = text.clone();
                                if let Ok(mut list) = entries.lock() {
                                    list.retain(|item| item.text != text);
                                    list.insert(
                                        0,
                                        SpotlightClipboardEntry {
                                            id: next_id,
                                            text,
                                            captured_at: unix_millis(),
                                        },
                                    );
                                    next_id = next_id.wrapping_add(1);
                                    if list.len() > 40 {
                                        list.truncate(40);
                                    }
                                }
                            }
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(1400)).await;
                }
            });
        }
    }

    pub fn list(&self) -> Vec<SpotlightClipboardEntry> {
        self.entries
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }
}

fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn spotlight_list_apps() -> Result<Vec<SpotlightAppEntry>, String> {
    let mut dirs: Vec<(PathBuf, &str)> = vec![
        (PathBuf::from("/Applications"), "Applications"),
        (PathBuf::from("/System/Applications"), "System"),
        (PathBuf::from("/System/Applications/Utilities"), "Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push((PathBuf::from(home).join("Applications"), "User"));
    }

    let mut apps = Vec::new();
    for (dir, source) in dirs {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("app") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    apps.push(SpotlightAppEntry {
                        name: stem.to_string(),
                        path: path.to_string_lossy().to_string(),
                        source: source.to_string(),
                    });
                }
            }
        }
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name) && a.path == b.path);
    Ok(apps)
}

#[tauri::command]
pub async fn spotlight_launch_app(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    crate::windows::hide_spotlight_window(app_handle);
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open {path}: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        opener::open(&path).map_err(|e| format!("Failed to open {path}: {e}"))
    }
}

#[tauri::command]
pub async fn spotlight_search_files(query: String) -> Result<Vec<SpotlightFileEntry>, String> {
    let trimmed = query.trim();
    if trimmed.len() < 2 {
        return Ok(Vec::new());
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string());
        let output = tokio::process::Command::new("mdfind")
            .args(["-onlyin", &home, "-name", trimmed])
            .output()
            .await
            .map_err(|e| format!("mdfind failed: {e}"))?;
        if !output.status.success() {
            return Ok(Vec::new());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut results = Vec::new();
        for line in stdout.lines() {
            if results.len() >= 14 {
                break;
            }
            let p = PathBuf::from(line.trim());
            // Skip build artifacts & hidden cache noise
            let path_str = p.to_string_lossy();
            if path_str.contains("/node_modules/")
                || path_str.contains("/target/")
                || path_str.contains("/.git/")
                || path_str.contains("/Library/Caches/")
            {
                continue;
            }
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                results.push(SpotlightFileEntry {
                    name: name.to_string(),
                    path: path_str.to_string(),
                    is_dir: p.is_dir(),
                });
            }
        }
        Ok(results)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = trimmed;
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn spotlight_get_clipboard_history(
    state: State<'_, ClipboardHistoryState>,
) -> Result<Vec<SpotlightClipboardEntry>, String> {
    Ok(state.list())
}

#[tauri::command]
pub async fn spotlight_copy_to_clipboard(
    app_handle: tauri::AppHandle,
    text: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("pbcopy failed: {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(text.as_bytes());
        }
        let _ = child.wait();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
    }
    crate::windows::hide_spotlight_window(app_handle);
    Ok(())
}

#[tauri::command]
pub async fn spotlight_list_system_actions() -> Result<Vec<SpotlightSystemAction>, String> {
    let action = |id: &str, title: &str, subtitle: &str, category: &str, kw: &[&str]| {
        SpotlightSystemAction {
            id: id.to_string(),
            title: title.to_string(),
            subtitle: subtitle.to_string(),
            category: category.to_string(),
            keywords: kw.iter().map(|s| s.to_string()).collect(),
        }
    };
    Ok(vec![
        action("toggle-dark-mode", "Toggle Dark Mode", "Switch macOS light/dark appearance", "System", &["dark", "light", "theme", "appearance"]),
        action("lock-screen", "Lock Screen", "Put display to sleep and lock macOS", "System", &["lock", "sleep", "security"]),
        action("sleep", "Sleep Mac", "Put this computer to sleep", "System", &["sleep", "power", "suspend"]),
        action("empty-trash", "Empty Trash", "Permanently empty macOS Trash", "System", &["trash", "bin", "clean"]),
        action("mute-toggle", "Toggle Mute Audio", "Mute or unmute system output volume", "System", &["mute", "volume", "sound", "audio"]),
        action("screenshot-selection", "Capture Screenshot", "Select an area to copy to clipboard", "System", &["screenshot", "capture", "snap"]),
        action("window-left-half", "Tile Window Left Half", "Move active window to left half of screen", "Window", &["window", "left", "tile", "split"]),
        action("window-right-half", "Tile Window Right Half", "Move active window to right half of screen", "Window", &["window", "right", "tile", "split"]),
        action("window-maximize", "Maximize Active Window", "Fill the active screen with the frontmost window", "Window", &["window", "maximize", "full", "fill"]),
        action("window-center", "Center Active Window", "Center the frontmost window on screen", "Window", &["window", "center"]),
        action("open-hanzo-chat", "Open Hanzo Chat", "Switch to Hanzo main chat window", "Hanzo", &["chat", "hanzo", "ai"]),
        action("open-hanzo-dev", "Open Hanzo Dev", "Open coding workspace in Hanzo", "Hanzo", &["dev", "code", "workspace", "hanzo"]),
        action("open-permissions", "Permissions & Command Settings", "Configure Accessibility, Full Disk Access, and hotkeys", "Hanzo", &["permissions", "settings", "shortcut", "hotkey"]),
    ])
}

#[tauri::command]
pub async fn spotlight_run_system_action(
    app_handle: tauri::AppHandle,
    action_id: String,
) -> Result<(), String> {
    crate::windows::hide_spotlight_window(app_handle.clone());
    match action_id.as_str() {
        "open-hanzo-chat" => {
            crate::windows::open_main_window_with_path(app_handle, "/chat".to_string());
            return Ok(());
        }
        "open-hanzo-dev" => {
            crate::windows::open_main_window_with_path(app_handle, "/dev".to_string());
            return Ok(());
        }
        "open-permissions" => {
            crate::windows::open_main_window_with_path(app_handle, "/onboarding".to_string());
            return Ok(());
        }
        _ => {}
    }

    #[cfg(target_os = "macos")]
    {
        match action_id.as_str() {
            "toggle-dark-mode" => {
                let _ = Command::new("osascript")
                    .args(["-e", r#"tell application "System Events" to tell appearance preferences to set dark mode to not dark mode"#])
                    .spawn();
            }
            "lock-screen" => {
                let _ = Command::new("pmset").arg("displaysleepnow").spawn();
            }
            "sleep" => {
                let _ = Command::new("pmset").arg("sleepnow").spawn();
            }
            "empty-trash" => {
                let _ = Command::new("osascript")
                    .args(["-e", r#"tell application "Finder" to empty trash"#])
                    .spawn();
            }
            "mute-toggle" => {
                let _ = Command::new("osascript")
                    .args(["-e", "set volume output muted (not (output muted of (get volume settings)))"])
                    .spawn();
            }
            "screenshot-selection" => {
                let _ = Command::new("screencapture").args(["-i", "-c"]).spawn();
            }
            "window-left-half" | "window-right-half" | "window-maximize" | "window-center" => {
                let script = match action_id.as_str() {
                    "window-left-half" => r#"tell application "Finder" to set b to bounds of window of desktop
set sw to item 3 of b
set sh to item 4 of b
tell application "System Events"
  set p to first application process whose frontmost is true
  tell front window of p
    set position to {0, 25}
    set size to {sw / 2, sh - 25}
  end tell
end tell"#,
                    "window-right-half" => r#"tell application "Finder" to set b to bounds of window of desktop
set sw to item 3 of b
set sh to item 4 of b
tell application "System Events"
  set p to first application process whose frontmost is true
  tell front window of p
    set position to {sw / 2, 25}
    set size to {sw / 2, sh - 25}
  end tell
end tell"#,
                    "window-maximize" => r#"tell application "Finder" to set b to bounds of window of desktop
set sw to item 3 of b
set sh to item 4 of b
tell application "System Events"
  set p to first application process whose frontmost is true
  tell front window of p
    set position to {0, 25}
    set size to {sw, sh - 25}
  end tell
end tell"#,
                    _ => r#"tell application "Finder" to set b to bounds of window of desktop
set sw to item 3 of b
set sh to item 4 of b
tell application "System Events"
  set p to first application process whose frontmost is true
  tell front window of p
    set {ww, wh} to size
    set position to {(sw - ww) / 2, (sh - wh) / 2}
  end tell
end tell"#,
                };
                let _ = Command::new("osascript").args(["-e", script]).spawn();
            }
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn lists_system_actions_and_apps() {
        let actions = spotlight_list_system_actions().await.expect("actions");
        assert!(actions.iter().any(|a| a.id == "toggle-dark-mode"));
        assert!(actions.iter().any(|a| a.id == "window-left-half"));
        let apps = spotlight_list_apps().await.expect("apps");
        #[cfg(target_os = "macos")]
        assert!(!apps.is_empty());
        let _ = apps;
    }
}
