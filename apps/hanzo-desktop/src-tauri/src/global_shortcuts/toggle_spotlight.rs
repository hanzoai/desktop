use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutEvent};

use crate::commands::system_permissions::{capture_frontmost_context, SpotlightState};
use crate::windows::{recreate_window, Window};

pub fn toggle_spotlight(app: &tauri::AppHandle, _: Shortcut, _: ShortcutEvent) {
    log::info!("toggling Hanzo Command spotlight window");
    if let Some(spotlight_window) = app.get_webview_window(Window::Spotlight.as_str()) {
        if spotlight_window.is_visible().unwrap_or(false)
            && spotlight_window.is_focused().unwrap_or(false)
        {
            let _ = spotlight_window.hide();
            return;
        }
    }
    let captured = capture_frontmost_context();
    let context = if let Some(state) = app.try_state::<SpotlightState>() {
        state.update_context(captured)
    } else {
        captured
    };
    if let Ok(window) = recreate_window(app.clone(), Window::Spotlight, true) {
        let _ = window.center();
        let _ = app.emit_to(Window::Spotlight.as_str(), "spotlight:context", context);
    }
}
