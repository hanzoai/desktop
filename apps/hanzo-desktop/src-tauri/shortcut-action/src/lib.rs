//! Which action a global shortcut runs. Pure: the app registers the keys and
//! runs the action; this only decides, so CI can test it without Tauri.

use keyboard_types::{Code, Modifiers};

#[derive(Debug, PartialEq)]
pub enum Action {
    CreateChat,
}

/// main.rs registers each key under both Super and Control, and the shortcuts
/// page advertises both. Only Super was matched, so the Control pair was taken
/// from every other app and then did nothing.
pub fn action(mods: Modifiers, key: Code) -> Option<Action> {
    if mods != (Modifiers::SUPER | Modifiers::SHIFT) && mods != (Modifiers::CONTROL | Modifiers::SHIFT) {
        return None;
    }
    match key {
        Code::KeyI => Some(Action::CreateChat),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUPER: Modifiers = Modifiers::SUPER.union(Modifiers::SHIFT);
    const CTRL: Modifiers = Modifiers::CONTROL.union(Modifiers::SHIFT);

    #[test]
    fn i_opens_a_chat_under_super_or_control() {
        assert_eq!(action(SUPER, Code::KeyI), Some(Action::CreateChat));
        assert_eq!(action(CTRL, Code::KeyI), Some(Action::CreateChat));
    }

    #[test]
    fn j_is_no_shortcut_now_that_spotlight_is_gone() {
        assert_eq!(action(SUPER, Code::KeyJ), None);
        assert_eq!(action(CTRL, Code::KeyJ), None);
    }

    #[test]
    fn other_keys_and_modifiers_are_not_handled() {
        assert_eq!(action(CTRL, Code::KeyK), None);
        assert_eq!(action(Modifiers::ALT | Modifiers::SHIFT, Code::KeyI), None);
        assert_eq!(action(Modifiers::CONTROL, Code::KeyI), None);
    }
}
