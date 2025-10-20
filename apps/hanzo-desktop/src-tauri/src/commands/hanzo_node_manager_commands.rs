use log::error;

use crate::globals::SHINKAI_NODE_MANAGER_INSTANCE;
use crate::local_hanzo_node::hanzo_node_manager::HanzoNodeManager;
use crate::local_hanzo_node::hanzo_node_options::HanzoNodeOptions;
use crate::windows::{recreate_window, Window};

#[tauri::command]
pub async fn show_hanzo_node_manager_window(app_handle: tauri::AppHandle) {
    let _ = recreate_window(app_handle, Window::HanzoNodeManager, true);
}

#[tauri::command]
pub async fn hanzo_node_is_running() -> Result<bool, String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().read().await;
    let is_running = hanzo_node_manager_guard.is_running().await;
    Ok(is_running)
}

#[tauri::command]
pub async fn hanzo_node_set_options(
    options: HanzoNodeOptions,
) -> Result<HanzoNodeOptions, String> {
    let mut hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
    let options = hanzo_node_manager_guard
        .set_hanzo_node_options(options)
        .await;
    Ok(options)
}

#[tauri::command]
pub async fn hanzo_node_get_options() -> Result<HanzoNodeOptions, String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().read().await;
    let options = hanzo_node_manager_guard.get_hanzo_node_options().await;
    Ok(options)
}

#[tauri::command]
pub async fn hanzo_node_spawn() -> Result<(), String> {
    let mut hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
    match hanzo_node_manager_guard.spawn().await {
        Ok(_) => Ok(()),
        Err(message) => {
            error!("error spawning hanzo node: {}", message);
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn hanzo_node_kill() -> Result<(), String> {
    let mut hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
    hanzo_node_manager_guard.kill().await;
    Ok(())
}

#[tauri::command]
pub async fn hanzo_node_remove_storage(preserve_keys: bool) -> Result<(), String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
    match hanzo_node_manager_guard
        .remove_storage(preserve_keys)
        .await
    {
        Ok(_) => Ok(()),
        Err(_) => Ok(()),
    }
}

#[tauri::command]
pub async fn hanzo_node_set_default_options() -> Result<HanzoNodeOptions, String> {
    let mut hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
    let options = hanzo_node_manager_guard
        .set_default_hanzo_node_options()
        .await;
    Ok(options)
}

#[tauri::command]
pub async fn hanzo_node_get_ollama_api_url() -> Result<String, String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().read().await;
    let ollama_api_url = hanzo_node_manager_guard.get_ollama_api_url();
    Ok(ollama_api_url)
}

#[tauri::command]
pub async fn hanzo_node_get_default_model() -> Result<String, String> {
    Ok("hanzo-backend:FREE_TEXT_INFERENCE".to_string())
}

#[tauri::command]
pub async fn hanzo_node_get_default_embedding_model() -> Result<String, String> {
    let default_options = HanzoNodeOptions::default();
    Ok(default_options.default_embedding_model.unwrap_or_else(|| "embeddinggemma:300m".to_string()))
}

#[tauri::command]
pub async fn hanzo_node_get_ollama_version(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    match HanzoNodeManager::get_ollama_version(app_handle).await {
        Ok(version) => Ok(version),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub async fn hanzo_node_open_storage_location() -> Result<(), String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().read().await;
    match hanzo_node_manager_guard.open_storage_location() {
        Ok(_) => Ok(()),
        Err(message) => Err(message),
    }
}

#[tauri::command]
pub async fn hanzo_node_open_storage_location_with_path(relative_path: String) -> Result<(), String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().read().await;
    match hanzo_node_manager_guard.open_storage_location_with_path(&relative_path) {
        Ok(_) => Ok(()),
        Err(message) => Err(message),
    }
}

#[tauri::command]
pub async fn hanzo_node_open_chat_folder(storage_location: &str, chat_folder_name: &str) -> Result<(), String> {
    let hanzo_node_manager_guard = SHINKAI_NODE_MANAGER_INSTANCE.get().unwrap().read().await;
    match hanzo_node_manager_guard.open_chat_folder(storage_location, chat_folder_name) {
        Ok(_) => Ok(()),
        Err(message) => Err(message),
    }
}
