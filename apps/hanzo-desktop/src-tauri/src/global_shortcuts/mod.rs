use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

mod create_chat;
mod toggle_spotlight;

#[derive(Debug, PartialEq)]
enum Action {
    CreateChat,
    ToggleSpotlight,
}

/// main.rs registers each key under both Super and Control, and the shortcuts
/// page advertises both. Only Super was matched, so the Control pair was taken
/// from every other app and then did nothing.
fn action(shortcut: &Shortcut) -> Option<Action> {
    let on = |key: Code| {
        shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, key)
            || shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, key)
    };
    if on(Code::KeyI) {
        Some(Action::CreateChat)
    } else if on(Code::KeyJ) {
        Some(Action::ToggleSpotlight)
    } else {
        None
    }
}

pub fn global_shortcut_handler(app: &tauri::AppHandle, shortcut: Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    match action(&shortcut) {
        Some(Action::CreateChat) => create_chat::create_chat(app, shortcut, event),
        Some(Action::ToggleSpotlight) => toggle_spotlight::toggle_spotlight(app, shortcut, event),
        None => log::warn!("unhandled shortcut: {:?}", shortcut),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn press(mods: Modifiers, key: Code) -> Option<Action> {
        action(&Shortcut::new(Some(mods), key))
    }

    #[test]
    fn i_opens_a_chat_under_super_or_control() {
        assert_eq!(press(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyI), Some(Action::CreateChat));
        assert_eq!(press(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyI), Some(Action::CreateChat));
    }

    #[test]
    fn j_toggles_spotlight_under_super_or_control() {
        assert_eq!(press(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyJ), Some(Action::ToggleSpotlight));
        assert_eq!(press(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyJ), Some(Action::ToggleSpotlight));
    }

    #[test]
    fn other_keys_are_not_handled() {
        assert_eq!(press(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyK), None);
        assert_eq!(press(Modifiers::ALT | Modifiers::SHIFT, Code::KeyI), None);
    }
}
