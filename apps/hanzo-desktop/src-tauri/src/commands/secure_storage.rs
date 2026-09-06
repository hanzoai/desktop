use keyring::Entry;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, State};

// In-memory fallback for development
pub type SecureStore = Mutex<HashMap<String, String>>;

/// Keychain service name = this bundle's identifier.
///
/// The identifier is already the one brand-varying identity in the build
/// (`tauri.conf.<brand>.json` sets `com.hanzo.desktop` / `com.zoo.desktop` /
/// `com.lux.desktop`, and `scripts/brand-build.cjs` swaps it in before
/// `generate_context!`), so deriving the service from it means Hanzo, Lux and
/// Zoo installs never read each other's credentials on a shared machine. This
/// was a hardcoded "com.hanzo.desktop", which filed every brand's tokens under
/// Hanzo's keychain entry.
fn service_name(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

#[tauri::command]
pub async fn secure_storage_set(
    app: AppHandle,
    key: String,
    value: String,
    _store: State<'_, SecureStore>,
) -> Result<(), String> {
    // Try to use OS keyring first
    match Entry::new(&service_name(&app), &key) {
        Ok(entry) => {
            entry
                .set_password(&value)
                .map_err(|e| format!("Failed to store in keyring: {}", e))?;
            Ok(())
        }
        Err(e) => {
            // Fallback to in-memory storage (development only)
            log::warn!("Keyring unavailable, using in-memory storage: {}", e);
            let mut store = _store.lock().unwrap();
            store.insert(key, value);
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn secure_storage_get(
    app: AppHandle,
    key: String,
    _store: State<'_, SecureStore>,
) -> Result<String, String> {
    // Try keyring first
    match Entry::new(&service_name(&app), &key) {
        Ok(entry) => match entry.get_password() {
            Ok(value) => Ok(value),
            Err(keyring::Error::NoEntry) => Err("Key not found".to_string()),
            Err(e) => Err(format!("Failed to retrieve from keyring: {}", e)),
        },
        Err(_) => {
            // Fallback to in-memory storage
            let store = _store.lock().unwrap();
            store
                .get(&key)
                .cloned()
                .ok_or_else(|| "Key not found".to_string())
        }
    }
}

#[tauri::command]
pub async fn secure_storage_delete(
    app: AppHandle,
    key: String,
    _store: State<'_, SecureStore>,
) -> Result<(), String> {
    // Try keyring first
    match Entry::new(&service_name(&app), &key) {
        Ok(entry) => {
            entry
                .delete_credential()
                .map_err(|e| format!("Failed to delete from keyring: {}", e))?;
            Ok(())
        }
        Err(_) => {
            // Fallback to in-memory storage
            let mut store = _store.lock().unwrap();
            store.remove(&key);
            Ok(())
        }
    }
}

pub fn init_secure_storage() -> SecureStore {
    Mutex::new(HashMap::new())
}
