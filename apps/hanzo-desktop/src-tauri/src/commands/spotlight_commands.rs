use serde::Serialize;
use tauri::{Emitter, LogicalSize, Manager, Size};

use crate::commands::system_permissions::{capture_frontmost_context, SpotlightState};
use crate::windows::{
    hide_spotlight_window, open_main_window_with_path, recreate_window, show_spotlight_window,
    Window,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpotlightDispatchPayload {
    prompt: String,
    context_app: Option<String>,
    mode: String,
}

#[tauri::command]
pub async fn hide_spotlight_window_app(app_handle: tauri::AppHandle) {
    hide_spotlight_window(app_handle)
}

#[tauri::command]
pub async fn show_spotlight_window_app(app_handle: tauri::AppHandle) {
    if let Some(state) = app_handle.try_state::<SpotlightState>() {
        let ctx = state.update_context(capture_frontmost_context());
        let _ = recreate_window(app_handle.clone(), Window::Spotlight, true);
        let _ = app_handle.emit_to(Window::Spotlight.as_str(), "spotlight:context", ctx);
        return;
    }
    show_spotlight_window(app_handle)
}

#[tauri::command]
pub async fn open_main_window_with_path_app(app_handle: tauri::AppHandle, path: String) {
    open_main_window_with_path(app_handle, path)
}

#[tauri::command]
pub async fn spotlight_dispatch_prompt(
    app_handle: tauri::AppHandle,
    prompt: String,
    context_app: Option<String>,
    mode: Option<String>,
) -> Result<(), String> {
    hide_spotlight_window(app_handle.clone());
    let mode_str = mode.unwrap_or_else(|| "chat".to_string());
    let path = if mode_str == "dev" { "/dev" } else { "/chat" };
    open_main_window_with_path(app_handle.clone(), path.to_string());
    let payload = SpotlightDispatchPayload {
        prompt,
        context_app,
        mode: mode_str,
    };
    let _ = app_handle.emit_to(Window::Main.as_str(), "spotlight:dispatch", payload);
    Ok(())
}

#[tauri::command]
pub async fn spotlight_resize_window(
    app_handle: tauri::AppHandle,
    height: f64,
) -> Result<(), String> {
    let clamped = height.clamp(160.0, 560.0);
    if let Some(window) = app_handle.get_webview_window(Window::Spotlight.as_str()) {
        let _ = window.set_size(Size::Logical(LogicalSize {
            width: 640.0,
            height: clamped,
        }));
    }
    Ok(())
}
