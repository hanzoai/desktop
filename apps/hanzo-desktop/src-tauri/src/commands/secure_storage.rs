use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::local_hanzo_node::session;

// Process-local secret store. Durable login lives in `~/.hanzo/` (identity.rs)
// and secrets live in Hanzo Cloud KMS — never the macOS login keychain, so
// local and updated desktop builds never trigger macOS Keychain prompts.
pub type SecureStore = Mutex<HashMap<String, String>>;

#[tauri::command]
pub async fn secure_storage_set(
    app: AppHandle,
    key: String,
    value: String,
    store: State<'_, SecureStore>,
) -> Result<(), String> {
    {
        let mut map = store.lock().map_err(|e| format!("Store lock failed: {}", e))?;
        map.insert(key.clone(), value);
    }
    if session::is_session_record(&key) {
        session::changed(app);
    }
    Ok(())
}

#[tauri::command]
pub async fn secure_storage_get(
    _app: AppHandle,
    key: String,
    store: State<'_, SecureStore>,
) -> Result<String, String> {
    lookup(&key, &store)
}

fn lookup(key: &str, store: &SecureStore) -> Result<String, String> {
    let map = store.lock().map_err(|e| format!("Store lock failed: {}", e))?;
    map.get(key)
        .cloned()
        .ok_or_else(|| "Key not found".to_string())
}

pub fn read(app: &AppHandle, key: &str) -> Option<String> {
    let state = app.try_state::<SecureStore>()?;
    lookup(key, state.inner()).ok()
}

#[tauri::command]
pub async fn secure_storage_delete(
    app: AppHandle,
    key: String,
    store: State<'_, SecureStore>,
) -> Result<(), String> {
    {
        let mut map = store.lock().map_err(|e| format!("Store lock failed: {}", e))?;
        map.remove(&key);
    }
    if session::is_session_record(&key) {
        session::changed(app);
    }
    Ok(())
}

pub fn init_secure_storage() -> SecureStore {
    Mutex::new(HashMap::new())
}
