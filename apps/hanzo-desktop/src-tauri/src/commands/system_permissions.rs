use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub const DEFAULT_COMMAND_SHORTCUT: &str = "Alt+Space";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontmostContext {
    pub app_name: String,
    pub window_title: Option<String>,
    pub captured_at: u64,
}

impl Default for FrontmostContext {
    fn default() -> Self {
        Self {
            app_name: "Desktop".to_string(),
            window_title: None,
            captured_at: unix_millis(),
        }
    }
}

pub struct SpotlightState {
    pub context: Mutex<FrontmostContext>,
    pub shortcut: Mutex<String>,
    pub config_path: PathBuf,
}

impl SpotlightState {
    pub fn new(app_data_dir: &std::path::Path) -> Self {
        let config_path = app_data_dir.join("hanzo-command-shortcut.txt");
        let saved = std::fs::read_to_string(&config_path)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_COMMAND_SHORTCUT.to_string());
        Self {
            context: Mutex::new(FrontmostContext::default()),
            shortcut: Mutex::new(saved),
            config_path,
        }
    }

    pub fn current_shortcut(&self) -> String {
        self.shortcut
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| DEFAULT_COMMAND_SHORTCUT.to_string())
    }

    pub fn update_context(&self, next: FrontmostContext) -> FrontmostContext {
        if let Ok(mut guard) = self.context.lock() {
            // Keep the previous external app name if Hanzo itself is already frontmost.
            let lower = next.app_name.to_lowercase();
            let is_self = lower == "hanzo" || lower == "hanzo desktop" || lower == "hanzo-desktop";
            if !is_self || guard.app_name == "Desktop" {
                *guard = next;
            }
            return guard.clone();
        }
        next
    }

    pub fn current_context(&self) -> FrontmostContext {
        self.context
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

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "AVFoundation", kind = "framework")]
extern "C" {
    static AVMediaTypeAudio: *const std::ffi::c_void;
}

#[cfg(target_os = "macos")]
#[link(name = "objc", kind = "dylib")]
extern "C" {
    fn objc_getClass(name: *const std::ffi::c_char) -> *const std::ffi::c_void;
    fn sel_registerName(name: *const std::ffi::c_char) -> *const std::ffi::c_void;
    fn objc_msgSend();
}

pub fn check_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: Pure ApplicationServices TCC status query.
        unsafe { AXIsProcessTrusted() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

pub fn check_screen_recording_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: Pure CoreGraphics preflight check with no prompt.
        unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

pub fn check_full_disk_access_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let user_tcc = home.join("Library/Application Support/com.apple.TCC/TCC.db");
            if user_tcc.exists() {
                return std::fs::File::open(&user_tcc).is_ok();
            }
            let mail_dir = home.join("Library/Mail");
            if mail_dir.exists() {
                return std::fs::read_dir(&mail_dir).is_ok();
            }
            let messages_dir = home.join("Library/Messages");
            if messages_dir.exists() {
                return std::fs::read_dir(&messages_dir).is_ok();
            }
        }
        std::fs::File::open("/Library/Application Support/com.apple.TCC/TCC.db").is_ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

pub fn check_microphone_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{c_char, c_void};
        // SAFETY: Standard Objective-C runtime call to
        // [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio].
        unsafe {
            let cls = objc_getClass(b"AVCaptureDevice\0".as_ptr() as *const c_char);
            if cls.is_null() {
                return false;
            }
            let sel = sel_registerName(b"authorizationStatusForMediaType:\0".as_ptr() as *const c_char);
            if sel.is_null() {
                return false;
            }
            let send: extern "C" fn(*const c_void, *const c_void, *const c_void) -> isize =
                std::mem::transmute(objc_msgSend as *const ());
            // AVAuthorizationStatusAuthorized == 3
            send(cls, sel, AVMediaTypeAudio) == 3
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

pub fn capture_frontmost_context() -> FrontmostContext {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("osascript")
            .args([
                "-e",
                r#"tell application "System Events"
                    set p to first application process whose frontmost is true
                    set appName to name of p
                    set winTitle to ""
                    try
                        set winTitle to name of front window of p
                    end try
                    return appName & linefeed & winTitle
                end tell"#,
            ])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                let mut lines = text.lines();
                let app_name = lines.next().unwrap_or("").trim().to_string();
                let window_title = lines
                    .next()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                if !app_name.is_empty() {
                    return FrontmostContext {
                        app_name,
                        window_title,
                        captured_at: unix_millis(),
                    };
                }
            }
        }
    }
    FrontmostContext::default()
}

#[tauri::command]
pub async fn desktop_check_system_permission(pane: String) -> Result<bool, String> {
    let granted = match pane.as_str() {
        "accessibility" => check_accessibility_permission(),
        "screen-recording" => check_screen_recording_permission(),
        "full-disk-access" => check_full_disk_access_permission(),
        "microphone" => check_microphone_permission(),
        _ => false,
    };
    Ok(granted)
}

#[tauri::command]
pub async fn desktop_open_system_settings(pane: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        if pane == "screen-recording" && !check_screen_recording_permission() {
            // SAFETY: Registers Hanzo in macOS System Settings -> Screen Recording.
            unsafe {
                let _ = CGRequestScreenCaptureAccess();
            }
        }
        let target = match pane.as_str() {
            "full-disk-access" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
            }
            "screen-recording" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
            "accessibility" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            }
            "microphone" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            }
            _ => "x-apple.systempreferences:com.apple.preference.security",
        };
        Ok(opener::open(target).is_ok())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pane;
        Ok(false)
    }
}

#[tauri::command]
pub async fn desktop_get_frontmost_context(
    state: State<'_, SpotlightState>,
) -> Result<FrontmostContext, String> {
    Ok(state.current_context())
}

#[tauri::command]
pub async fn desktop_get_spotlight_shortcut(
    state: State<'_, SpotlightState>,
) -> Result<String, String> {
    Ok(state.current_shortcut())
}

#[tauri::command]
pub async fn desktop_set_spotlight_shortcut(
    app: AppHandle,
    state: State<'_, SpotlightState>,
    shortcut: String,
) -> Result<String, String> {
    let trimmed = shortcut.trim().to_string();
    if trimmed.is_empty() {
        return Err("Shortcut cannot be empty".to_string());
    }
    let previous = state.current_shortcut();
    let gs = app.global_shortcut();
    if previous.to_lowercase() != trimmed.to_lowercase()
        && !matches!(
            previous.to_lowercase().as_str(),
            "super+shift+j" | "control+shift+j"
        )
    {
        let _ = gs.unregister(previous.as_str());
    }
    gs.register(trimmed.as_str())
        .map_err(|e| format!("Could not bind global shortcut '{}': {}", trimmed, e))?;

    if let Ok(mut guard) = state.shortcut.lock() {
        *guard = trimmed.clone();
    }
    if let Some(parent) = state.config_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&state.config_path, &trimmed);
    Ok(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_checks_execute_without_panicking() {
        let _ = check_accessibility_permission();
        let _ = check_screen_recording_permission();
        let _ = check_full_disk_access_permission();
        let _ = check_microphone_permission();
    }

    #[test]
    fn spotlight_state_ignores_self_app_name() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let state = SpotlightState::new(tmp.path());
        let first = state.update_context(FrontmostContext {
            app_name: "Hanzo Dev".to_string(),
            window_title: Some("Welcome".to_string()),
            captured_at: 1,
        });
        assert_eq!(first.app_name, "Hanzo Dev");

        let second = state.update_context(FrontmostContext {
            app_name: "Hanzo".to_string(),
            window_title: None,
            captured_at: 2,
        });
        assert_eq!(second.app_name, "Hanzo Dev");
    }
}
