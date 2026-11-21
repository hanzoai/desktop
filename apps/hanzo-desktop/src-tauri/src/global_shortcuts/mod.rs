use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

mod create_chat;

pub fn global_shortcut_handler(app: &tauri::AppHandle, shortcut: Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    match shortcut {
        // main.rs registers each key under both Super and Control, and the
        // shortcuts page advertises both. Only Super was matched, so the Control
        // pair was taken from every other app and then did nothing.
        s if s.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyI)
            || s.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyI) =>
        {
            create_chat::create_chat(app, shortcut, event);
        }
        _ => {
          log::warn!("unhandled shortcut: {:?}", shortcut);
        }
    }
}
