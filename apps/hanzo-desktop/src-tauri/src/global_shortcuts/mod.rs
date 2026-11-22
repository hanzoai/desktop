use hanzo_shortcut_action::{action, Action};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutEvent, ShortcutState};

mod create_chat;

pub fn global_shortcut_handler(app: &tauri::AppHandle, shortcut: Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    match action(shortcut.mods, shortcut.key) {
        Some(Action::CreateChat) => create_chat::create_chat(app, shortcut, event),
        None => log::warn!("unhandled shortcut: {:?}", shortcut),
    }
}
