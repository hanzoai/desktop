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
use crate::commands::service::{
    install_system_service, restart_system_service, system_service_status,
    uninstall_system_service,
};
use crate::commands::spotlight_commands::{hide_spotlight_window_app, show_spotlight_window_app, open_main_window_with_path_app};
use crate::commands::updater_env::updater_environment;
use deep_links::setup_deep_links;
use global_shortcuts::global_shortcut_handler;
use globals::HANZO_NODE_MANAGER_INSTANCE;
use local_hanzo_node::hanzo_node_manager::HanzoNodeManager;
use tauri::{Emitter, WindowEvent};
use tauri::{Manager, RunEvent};
use tokio::sync::{RwLock};
use tray::{create_tray, wire_node_events};
use windows::{recreate_window, recreate_window_hidden, Window};
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

/// Headless mode: start with NO visible window (tray + node + embedded engine
/// still run; the window can be opened later from the tray "Open Dashboard").
///
/// Triggered by either:
///   - env `HANZO_HEADLESS` set to a truthy value (`1`/`true`/`yes`/`on`), or
///   - a `--headless` CLI argument.
///
/// The systemd user unit we install (see `commands::service`) launches the
/// binary with `--headless` AND sets `HANZO_HEADLESS=1`, so the daemon never
/// pops a window on boot.
fn is_headless() -> bool {
    let env_headless = std::env::var("HANZO_HEADLESS")
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            matches!(v.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(false);
    let arg_headless = std::env::args().any(|a| a == "--headless");
    env_headless || arg_headless
}

/// Tauri-managed handle to the running embedded engines (chat + embeddings).
/// Present only when the embedded engine is enabled. Wrapped in a Mutex<Option>
/// so the exit handler can take and shut them down exactly once.
struct EmbeddedEngineHandle(tokio::sync::Mutex<Option<embedded_engine::EmbeddedEngines>>);

fn main() {
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let _ = app.emit("single-instance", Payload { args: argv, cwd });
            // Re-launching the app (e.g. double-clicking the icon) while it's
            // already running — including the headless daemon — should reveal
            // the dashboard rather than no-op. The secondary process exits; this
            // running one brings the main window to the front (recreating it if
            // it was never built in headless mode).
            let _ = recreate_window(app.clone(), Window::Main, true);
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
            install_system_service,
            uninstall_system_service,
            system_service_status,
            restart_system_service,
            updater_environment,
        ])
        .setup(|app| {
            log::info!("starting app version: {}", env!("CARGO_PKG_VERSION"));
            let app_resource_dir = app.path().resource_dir()?;
            let app_data_dir = app.path().app_data_dir()?;

            {
                let _ = HANZO_NODE_MANAGER_INSTANCE.set(Arc::new(RwLock::new(
                    HanzoNodeManager::new(app.handle().clone(), app_resource_dir, app_data_dir),
                )));
            }

            create_tray(app.handle())?;
            // Keep the tray's "Node: running/stopped" line live by subscribing
            // to the node manager's state-change broadcast.
            wire_node_events(app.handle());
            setup_deep_links(app.handle())?;

            let headless = is_headless();
            if headless {
                log::info!(
                    "headless mode: starting with no visible window (tray + node + engine only)"
                );
            }

            // Embedded (in-process) engine. DEFAULT OFF: gated behind the
            // HANZO_EMBEDDED_ENGINE env flag. When enabled, inference runs
            // in-process (chat on :36900, embeddings on :36901, OpenAI surface
            // under /v1/engine/*) instead of spawning external mistralrs-server
            // children. When off, the external engine remains the default
            // (see HanzoNodeManager::spawn). The handle is kept in Tauri state
            // so the servers can be shut down gracefully on exit.
            if embedded_engine::is_enabled() {
                tauri::async_runtime::spawn({
                    let app_handle = app.handle().clone();
                    async move {
                        match embedded_engine::start().await {
                            Ok(engines) => {
                                log::info!("embedded engine enabled and started");
                                app_handle.manage(EmbeddedEngineHandle(
                                    tokio::sync::Mutex::new(Some(engines)),
                                ));
                            }
                            Err(e) => {
                                log::error!("failed to start embedded engine: {}", e);
                            }
                        }
                    }
                });
            } else {
                log::info!(
                    "embedded engine disabled (set {}=1 to run inference in-process)",
                    embedded_engine::EMBEDDED_ENGINE_FLAG
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
                    drop(hanzo_node_manager_guard);

                    // Coordinator + Spotlight are always created hidden (focus=false).
                    let _ = recreate_window(app_handle.clone(), Window::Coordinator, false);
                    let _ = recreate_window(app_handle.clone(), Window::Spotlight, false);
                    // The main window is shown on launch UNLESS we're headless.
                    // When headless, build it with visible=false so the
                    // webview/IPC are warm and the tray's "Open Dashboard" can
                    // reveal it instantly without a flash on boot.
                    if headless {
                        let _ = recreate_window_hidden(app_handle.clone(), Window::Main);
                    } else {
                        let _ = recreate_window(app_handle.clone(), Window::Main, true);
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
                let exit_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    log::debug!("killing ollama and hanzo-node before exit");

                    // Gracefully stop the embedded engine servers if they were
                    // started (no-op when the embedded engine is disabled).
                    if let Some(handle) = exit_handle.try_state::<EmbeddedEngineHandle>() {
                        if let Some(mut engines) = handle.0.lock().await.take() {
                            engines.shutdown().await;
                        }
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
            } => {
                // Auto-hide the spotlight overlay when it loses focus.
                if label == Window::Spotlight.as_str() && !focused {
                    if let Some(spotlight_window) =
                        app_handle.get_webview_window(Window::Spotlight.as_str())
                    {
                        if spotlight_window.is_visible().unwrap_or(false) {
                            let _ = spotlight_window.hide();
                        }
                    }
                }
            }
            // Close-to-tray: closing the MAIN window does NOT quit the app — it
            // hides the window so the daemon keeps running in the tray. The user
            // exits via the tray "Quit" item (which calls process::exit). Other
            // windows keep their default close behavior.
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                if label == Window::Main.as_str() {
                    api.prevent_close();
                    if let Some(window) = app_handle.get_webview_window(Window::Main.as_str()) {
                        let _ = window.hide();
                    }
                    log::info!("main window close intercepted: hiding to tray");
                }
            }
            _ => {}
        });
}
