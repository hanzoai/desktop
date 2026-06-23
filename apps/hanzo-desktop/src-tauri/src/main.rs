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
use crate::commands::mining::{
    mining_get_balance, mining_get_history, mining_get_local_pending, mining_get_state,
    mining_get_wallet_address, mining_set_privacy, mining_start, mining_stop,
};
use crate::commands::secure_storage::{
    init_secure_storage, secure_storage_delete, secure_storage_get, secure_storage_set,
};
use crate::commands::spotlight_commands::{hide_spotlight_window_app, show_spotlight_window_app, open_main_window_with_path_app};
use crate::mining::MiningManager;
use crate::model_tools::{
    model_tools_bitdelta_apply, model_tools_bitdelta_encode, model_tools_grpo_run,
    model_tools_soup_average, model_tools_soup_available, model_tools_soup_delta,
};
use deep_links::setup_deep_links;
use global_shortcuts::global_shortcut_handler;
use globals::HANZO_NODE_MANAGER_INSTANCE;
use local_hanzo_node::hanzo_node_manager::HanzoNodeManager;
use tauri::{Emitter, WindowEvent};
use tauri::{Manager, RunEvent};
use tokio::sync::{RwLock};
use tray::create_tray;
use windows::{recreate_window, Window};
mod commands;
mod deep_links;
mod galxe;
mod global_shortcuts;
mod globals;
mod hardware;
mod local_hanzo_node;
#[cfg(feature = "machine")]
mod machine;
mod mining;
mod model_tools;
mod models;
mod tray;
mod windows;
// Native Hanzo Engine (in-process mistral.rs fork). Compiled only with the
// `native-engine` feature; the default build keeps using the node/ollama
// sidecars and skips the heavy inference stack entirely.
#[cfg(feature = "native-engine")]
mod embedded_engine;

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
            mining_get_state,
            mining_start,
            mining_stop,
            mining_get_balance,
            mining_get_wallet_address,
            mining_get_history,
            mining_get_local_pending,
            mining_set_privacy,
            secure_storage_set,
            secure_storage_get,
            secure_storage_delete,
            #[cfg(feature = "machine")]
            machine::commands::machine_health,
            #[cfg(feature = "machine")]
            machine::commands::machine_list,
            #[cfg(feature = "machine")]
            machine::commands::machine_get,
            #[cfg(feature = "machine")]
            machine::commands::machine_create,
            #[cfg(feature = "machine")]
            machine::commands::machine_start,
            #[cfg(feature = "machine")]
            machine::commands::machine_stop,
            #[cfg(feature = "machine")]
            machine::commands::machine_delete,
            #[cfg(feature = "machine")]
            machine::commands::machine_exec,
            #[cfg(feature = "machine")]
            machine::commands::machine_events_subscribe,
            // Native Hanzo Engine IPC commands (only when `native-engine` is on).
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_get_status,
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_load_gguf,
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_load_model,
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_unload_model,
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_is_model_loaded,
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_get_model_id,
            #[cfg(feature = "native-engine")]
            embedded_engine::engine_list_zen5_models,
            // hanzo-ml Model Tools (soup / BitDelta / GRPO) IPC commands.
            model_tools_soup_available,
            model_tools_soup_average,
            model_tools_soup_delta,
            model_tools_bitdelta_encode,
            model_tools_bitdelta_apply,
            model_tools_grpo_run,
        ])
        .setup(|app| {
            log::info!("starting app version: {}", env!("CARGO_PKG_VERSION"));
            let app_resource_dir = app.path().resource_dir()?;
            let app_data_dir = app.path().app_data_dir()?;

            {
                let _ = HANZO_NODE_MANAGER_INSTANCE.set(Arc::new(RwLock::new(
                    HanzoNodeManager::new(app.handle().clone(), app_resource_dir, app_data_dir.clone()),
                )));
            }

            // Initialize Phase 1 mining manager. Storage dir holds per-wallet
            // history.json; one subdir per wallet address.
            let mining_storage_dir = app_data_dir.join("mining");
            let _ = std::fs::create_dir_all(&mining_storage_dir);
            let mining_manager = Arc::new(MiningManager::new(mining_storage_dir));
            app.manage(mining_manager.clone());

            // Initialize secure storage (OS keyring with in-memory fallback)
            let secure_store = init_secure_storage();
            app.manage(secure_store);

            create_tray(app.handle())?;
            setup_deep_links(app.handle())?;

            // Native Hanzo Engine: manage the one shared orchestrator for both
            // the Tauri IPC commands and the `/v1/engine/*` HTTP management
            // routes. The canonical server (chat/responses/messages on
            // 127.0.0.1:36900, what the frontend client targets) is bound lazily
            // by the orchestrator on the first model load -- building an
            // `Arc<Hanzo>` requires a model, so there is nothing to serve until
            // one is loaded via `engine_load_model` / `/v1/engine/load`.
            #[cfg(feature = "native-engine")]
            {
                // `new_state` already wired the orchestrator's self-handle so the
                // merged `/v1/engine/*` management routes drive this same
                // instance.
                let engine_state = embedded_engine::new_state();
                app.manage(engine_state);
                log::info!(
                    "Hanzo Engine (native) ready; canonical server binds on 127.0.0.1:{} at first model load",
                    embedded_engine::DEFAULT_PORT
                );
            }

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
                    // Cold-boot start (bug #18): the kill above only clears a stale
                    // process — start this app's own node now so it is up without
                    // relying on a frontend effect that cannot fire before the node runs.
                    if let Err(e) = hanzo_node_manager_guard.spawn().await {
                        log::error!("[hanzo-node] cold-boot spawn failed: {}", e);
                    }
                    drop(hanzo_node_manager_guard);

                    let _ = recreate_window(app_handle.clone(), Window::Coordinator, false);
                    let _ = recreate_window(app_handle.clone(), Window::Spotlight, false);
                    let _ = recreate_window(app_handle.clone(), Window::Main, true);

                    // Auto-spawn the local hanzo-node sidecar so the app is
                    // usable for first-time users without requiring auth.
                    {
                        let mut guard = HANZO_NODE_MANAGER_INSTANCE
                            .get()
                            .unwrap()
                            .write()
                            .await;
                        if let Err(e) = guard.spawn().await {
                            log::error!("auto-spawn hanzo-node failed: {}", e);
                        } else {
                            log::info!("auto-spawned hanzo-node on app start");
                        }
                    }

                    // The AI-mining precompile is now native Rust
                    // (mining/precompile.rs — no Go FFI), so start Phase-1
                    // mining at boot with a stable per-install dev wallet, with
                    // no frontend/auth dependency. The frontend re-homes rewards
                    // to the user's connected wallet when it resolves. chain_id
                    // 96369 is the precompile's brand-agnostic default.
                    {
                        let mining_manager =
                            app_handle.state::<std::sync::Arc<MiningManager>>();
                        let wallet = mining_manager.ensure_dev_wallet();
                        mining_manager
                            .start_mining(app_handle.clone(), wallet, 96369)
                            .await;
                        log::info!("auto-started Phase-1 mining (native precompile)");
                    }
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
                    log::debug!("killing ollama and hanzo-node before exit");

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
