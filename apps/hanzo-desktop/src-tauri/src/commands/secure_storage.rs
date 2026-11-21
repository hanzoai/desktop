use keyring::Entry;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::local_hanzo_node::session;

// In-memory fallback for development
pub type SecureStore = Mutex<HashMap<String, String>>;

/// Keychain service name = this bundle's identifier.
///
/// The identifier is already the one brand-varying identity in the build
/// (`tauri.conf.<brand>.json` sets `ai.hanzo.desktop` / `com.zoo.desktop` /
/// `com.lux.desktop`, and `scripts/brand-build.cjs` swaps it in before
/// `generate_context!`), so deriving the service from it means Hanzo, Lux and
/// Zoo installs never read each other's credentials on a shared machine. This
/// was a hardcoded "ai.hanzo.desktop", which filed every brand's tokens under
/// Hanzo's keychain entry.
fn service_name(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

/// Keychain service this app used before the `ai.hanzo.<app>` identifier scheme.
const LEGACY_SERVICE: &str = "com.hanzo.desktop";

/// Moves a credential filed under the legacy service to the current one, so a
/// user signed in before the identifier change stays signed in.
fn legacy_get(service: &str, key: &str) -> Result<String, String> {
    if service != "ai.hanzo.desktop" {
        return Err("Key not found".to_string());
    }
    let old = Entry::new(LEGACY_SERVICE, key).map_err(|_| "Key not found".to_string())?;
    let value = old.get_password().map_err(|_| "Key not found".to_string())?;
    Entry::new(service, key)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| format!("Failed to migrate keyring entry: {}", e))?;
    let _ = old.delete_credential();
    Ok(value)
}

#[tauri::command]
pub async fn secure_storage_set(
    app: AppHandle,
    key: String,
    value: String,
    _store: State<'_, SecureStore>,
) -> Result<(), String> {
    // Try to use OS keyring first
    let result = match Entry::new(&service_name(&app), &key) {
        Ok(entry) => entry
            .set_password(&value)
            .map_err(|e| format!("Failed to store in keyring: {}", e)),
        Err(e) => {
            // Fallback to in-memory storage (development only)
            log::warn!("Keyring unavailable, using in-memory storage: {}", e);
            let mut store = _store.lock().unwrap();
            store.insert(key.clone(), value);
            Ok(())
        }
    };
    if session::is_session_record(&key) {
        // Signed in, or a refreshed token: the local node embeds with it.
        session::changed(app);
    }
    result
}

#[tauri::command]
pub async fn secure_storage_get(
    app: AppHandle,
    key: String,
    _store: State<'_, SecureStore>,
) -> Result<String, String> {
    lookup(&app, &key, &_store)
}

/// One entry: the keychain (moving a legacy entry over), or the in-memory
/// fallback when the keychain is unavailable.
fn lookup(app: &AppHandle, key: &str, store: &SecureStore) -> Result<String, String> {
    // Try keyring first
    match Entry::new(&service_name(app), key) {
        Ok(entry) => match entry.get_password() {
            Ok(value) => Ok(value),
            Err(keyring::Error::NoEntry) => legacy_get(&service_name(app), key),
            Err(e) => Err(format!("Failed to retrieve from keyring: {}", e)),
        },
        Err(_) => {
            // Fallback to in-memory storage
            let store = store.lock().unwrap();
            store
                .get(key)
                .cloned()
                .ok_or_else(|| "Key not found".to_string())
        }
    }
}

/// The value `secure_storage_get` would answer for `key`, for the Rust side
/// (the node reads the signed-in session through it), or `None`.
pub fn read(app: &AppHandle, key: &str) -> Option<String> {
    let fallback;
    let store = match app.try_state::<SecureStore>() {
        Some(state) => state.inner(),
        None => {
            fallback = init_secure_storage();
            &fallback
        }
    };
    lookup(app, key, store).ok()
}

#[tauri::command]
pub async fn secure_storage_delete(
    app: AppHandle,
    key: String,
    _store: State<'_, SecureStore>,
) -> Result<(), String> {
    // Try keyring first
    let result = match Entry::new(&service_name(&app), &key) {
        Ok(entry) => entry
            .delete_credential()
            .map_err(|e| format!("Failed to delete from keyring: {}", e)),
        Err(_) => {
            // Fallback to in-memory storage
            let mut store = _store.lock().unwrap();
            store.remove(&key);
            Ok(())
        }
    };
    if session::is_session_record(&key) {
        // Signed out: the local node stops embedding with the old key.
        session::changed(app);
    }
    result
}

pub fn init_secure_storage() -> SecureStore {
    Mutex::new(HashMap::new())
}
