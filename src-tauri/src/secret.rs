//! Where a secret is kept: the operating system's own store.
//!
//! One vault per installed app, because the service is the bundle identifier —
//! so two brands on one machine cannot read each other's, and a development
//! build cannot read a release one's.
//!
//! There is no in-memory fallback. A process-local map answers every call and
//! forgets on exit, which reads as a working keychain right up to the restart
//! that loses the secret; a refusal naming the reason is the more useful
//! answer, and it is the one the caller can act on.

use keyring::Entry;
use tauri::AppHandle;

fn entry(app: &AppHandle, name: &str) -> Result<Entry, String> {
    Entry::new(&app.config().identifier, name).map_err(|e| format!("no keychain: {e}"))
}

/// What is kept under this name, or nothing.
#[tauri::command]
pub fn secret(app: AppHandle, name: String) -> Result<Option<String>, String> {
    match entry(&app, &name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("cannot read {name}: {e}")),
    }
}

/// Keep this under that name, replacing whatever was there.
#[tauri::command]
pub fn keep(app: AppHandle, name: String, value: String) -> Result<(), String> {
    entry(&app, &name)?
        .set_password(&value)
        .map_err(|e| format!("cannot keep {name}: {e}"))
}
