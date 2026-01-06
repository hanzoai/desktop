// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use crate::commands::fetch::{get_request, post_request};
use crate::commands::galxe::galxe_generate_proof;
use crate::commands::hardware::hardware_get_summary;
use crate::commands::hanzo_node_manager_commands::{
    hanzo_node_get_default_model, hanzo_node_get_default_embedding_model, hanzo_node_get_ollama_api_url,
    hanzo_node_get_ollama_version, hanzo_node_get_options, hanzo_node_is_running,
    hanzo_node_kill, hanzo_node_remove_storage, hanzo_node_set_default_options,
    hanzo_node_set_options, hanzo_node_spawn, show_hanzo_node_manager_window,
    hanzo_node_open_storage_location, hanzo_node_open_storage_location_with_path,
    hanzo_node_open_chat_folder,
};
use crate::commands::mcp_clients_install::{
    check_claude_installed,
    get_claude_config_help,
    is_server_registered_in_claude,
    register_server_in_claude,
    check_cursor_installed,
    get_cursor_command_config_help,
    get_cursor_sse_config_help,
    is_server_registered_in_cursor,
    register_command_server_in_cursor,
    register_sse_server_in_cursor,
};
use crate::commands::logs::{download_logs, retrieve_logs};
use crate::commands::spotlight_commands::{hide_spotlight_window_app, show_spotlight_window_app, open_main_window_with_path_app};
use crate::embedded_engine::{
    engine_get_status, engine_load_gguf, engine_load_model, engine_unload_model,
    engine_chat, engine_stream_chat, engine_is_model_loaded, engine_get_model_id,
    EmbeddedEngine, EmbeddedEngineServer, DEFAULT_PORT,
};
use deep_links::setup_deep_links;
use global_shortcuts::global_shortcut_handler;
use globals::{HANZO_NODE_MANAGER_INSTANCE, EMBEDDED_ENGINE_INSTANCE, EMBEDDED_ENGINE_SERVER};
use local_hanzo_node::hanzo_node_manager::HanzoNodeManager;
use tauri::{Emitter, WindowEvent};
use tauri::{Manager, RunEvent};
use tokio::sync::RwLock;
use tray::create_tray;
use windows::{recreate_window, Window};
mod commands;
mod deep_links;
mod embedded_engine;
mod galxe;
mod global_shortcuts;
mod globals;
mod hardware;
mod local_hanzo_node;
mod models;
mod tray;
mod windows;

#[derive(Clone, serde::Serialize)]
struct Payload {
    args: Vec<String>,
    cwd: String,
}

fn main() {
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            app.emit("single-instance", Payload { args: argv, cwd })
                .unwrap();
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .format(|out, message, record| {
                    // Ending with a triple ideographic space as separator so then we can group texts that belongs to the same log
                    out.finish(format_args!(
                        "[{}][{}][{}] {}　　　",
                        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                        record.level(),
                        record.target(),
                        message
                    ))
                })
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([
                    "super+shift+i",
                    "control+shift+i",
                    "super+shift+j",
                    "control+shift+j",
                ])
                .unwrap()
                .with_handler(
                    |app: &tauri::AppHandle,
                     shortcut: &tauri_plugin_global_shortcut::Shortcut,
                     event: tauri_plugin_global_shortcut::ShortcutEvent| {
                        global_shortcut_handler(app, *shortcut, event)
                    },
                )
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            hide_spotlight_window_app,
            show_spotlight_window_app,
            open_main_window_with_path_app,
            show_hanzo_node_manager_window,
            hanzo_node_is_running,
            hanzo_node_get_options,
            hanzo_node_set_options,
            hanzo_node_spawn,
            hanzo_node_kill,
            hanzo_node_remove_storage,
            hanzo_node_open_storage_location,
            hanzo_node_open_storage_location_with_path,
            hanzo_node_open_chat_folder,
            hanzo_node_set_default_options,
            hanzo_node_get_ollama_api_url,
            hanzo_node_get_default_model,
            hanzo_node_get_default_embedding_model,
            hardware_get_summary,
            galxe_generate_proof,
            get_request,
            post_request,
            hanzo_node_get_ollama_version,
            retrieve_logs,
            download_logs,
            check_claude_installed,
            is_server_registered_in_claude,
            register_server_in_claude,
            get_claude_config_help,
            check_cursor_installed,
            is_server_registered_in_cursor,
            register_command_server_in_cursor,
            register_sse_server_in_cursor,
            get_cursor_command_config_help,
            get_cursor_sse_config_help,
            // Embedded Hanzo Engine commands
            engine_get_status,
            engine_load_gguf,
            engine_load_model,
            engine_unload_model,
            engine_chat,
            engine_stream_chat,
            engine_is_model_loaded,
            engine_get_model_id,
        ])
        .setup(|app| {
            log::info!("starting app version: {}", env!("CARGO_PKG_VERSION"));
            let app_resource_dir = app.path().resource_dir()?;
            let app_data_dir = app.path().app_data_dir()?;

            // Initialize Hanzo Node Manager (for optional sidecar processes)
            {
                let _ = HANZO_NODE_MANAGER_INSTANCE.set(Arc::new(RwLock::new(
                    HanzoNodeManager::new(app.handle().clone(), app_resource_dir.clone(), app_data_dir.clone()),
                )));
            }

            // Initialize Embedded Hanzo Engine (default inference backend)
            {
                let engine = EmbeddedEngine::new();
                let engine_arc = Arc::new(RwLock::new(engine));
                let _ = EMBEDDED_ENGINE_INSTANCE.set(engine_arc.clone());

                // Create and start the OpenAI-compatible HTTP server
                let server = EmbeddedEngineServer::new(engine_arc);
                let _ = EMBEDDED_ENGINE_SERVER.set(Arc::new(RwLock::new(server)));
            }

            create_tray(app.handle())?;
            setup_deep_links(app.handle())?;

            /*
                This is the initialization pipeline
                At some point we will need to add a UI because some tasks can be hard/slow to execute
            */
            tauri::async_runtime::spawn({
                let app_handle = app.handle().clone();
                async move {
                    // Kill any existing process related to hanzo and/or using hanzo ports
                    let mut hanzo_node_manager_guard =
                        HANZO_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
                    hanzo_node_manager_guard.kill().await;
                    drop(hanzo_node_manager_guard);

                    // Start the embedded engine HTTP server
                    if let Some(server) = EMBEDDED_ENGINE_SERVER.get() {
                        let mut server_guard = server.write().await;
                        if let Err(e) = server_guard.start().await {
                            log::error!("Failed to start embedded engine server: {}", e);
                        } else {
                            log::info!("Hanzo Engine server started on http://127.0.0.1:{}", DEFAULT_PORT);
                        }
                        drop(server_guard);
                    }

                    let _ = recreate_window(app_handle.clone(), Window::Coordinator, false);
                    let _ = recreate_window(app_handle.clone(), Window::Spotlight, false);
                    let _ = recreate_window(app_handle.clone(), Window::Main, true);
                }
            });

            tauri::async_runtime::spawn({
                let app_handle = app.handle().clone();
                async move {
                    let mut hanzo_node_manager_guard =
                        HANZO_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
                    let mut receiver = hanzo_node_manager_guard.subscribe_to_events();
                    drop(hanzo_node_manager_guard);
                    while let Ok(state_change) = receiver.recv().await {
                        app_handle
                            .emit("hanzo-node-state-change", state_change)
                            .unwrap_or_else(|e| {
                                log::error!("failed to emit global event for state change: {}", e);
                            });
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(move |app_handle, event| match event {
            RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            RunEvent::Exit { .. } => {
                tauri::async_runtime::spawn(async {
                    log::debug!("shutting down hanzo engine and sidecar processes before exit");

                    // Stop the embedded engine server
                    if let Some(server) = EMBEDDED_ENGINE_SERVER.get() {
                        let mut server_guard = server.write().await;
                        if let Err(e) = server_guard.stop().await {
                            log::error!("Failed to stop embedded engine server: {}", e);
                        }
                        drop(server_guard);
                    }

                    // For some reason process::exit doesn't fire RunEvent::ExitRequested event in tauri
                    let mut hanzo_node_manager_guard =
                        HANZO_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
                    hanzo_node_manager_guard.kill().await;
                    drop(hanzo_node_manager_guard);
                    // Force exit the application
                    std::process::exit(0);
                });
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                let main_window_label = "main";
                if let Some(window) = app_handle.get_webview_window(main_window_label) {
                    window.show().unwrap();
                    window.center().unwrap();
                    let _ = window.set_focus();
                } else {
                    let main_window_config = app_handle
                        .config()
                        .app
                        .windows
                        .iter()
                        .find(|w| w.label == main_window_label)
                        .unwrap()
                        .clone();
                    match tauri::WebviewWindowBuilder::from_config(app_handle, &main_window_config)
                    {
                        Ok(builder) => {
                            if let Err(e) = builder.build() {
                                log::error!("failed to build main window: {}", e);
                            }
                        }
                        Err(e) => {
                            log::error!("failed to create WebviewWindowBuilder from config: {}", e);
                        }
                    }
                }
            }
            RunEvent::Ready => {}
            RunEvent::Resumed => {}
            RunEvent::MainEventsCleared => {}
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::Focused(focused),
                ..
            } => match label {
                label if label == Window::Spotlight.as_str() => {
                    if !focused {
                        if let Some(spotlight_window) =
                            app_handle.get_webview_window(Window::Spotlight.as_str())
                        {
                            if spotlight_window.is_visible().unwrap_or(false) {
                                let _ = spotlight_window.hide();
                            }
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        });
}
