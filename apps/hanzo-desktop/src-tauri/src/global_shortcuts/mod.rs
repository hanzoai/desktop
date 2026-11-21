use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

mod create_chat;
mod toggle_spotlight;

pub fn global_shortcut_handler(app: &tauri::AppHandle, shortcut: Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    match shortcut {
        s if s.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyI)
            || s.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyI) =>
        {
            create_chat::create_chat(app, shortcut, event);
        }
        // Any other registered global shortcut (Cmd/Ctrl+Shift+J, Option+Space, or the user's
        // custom Hanzo Command binding) toggles the floating Hanzo Command HUD.
        _ => {
            toggle_spotlight::toggle_spotlight(app, shortcut, event);
        }
    }
}
