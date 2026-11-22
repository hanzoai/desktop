// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

#[cfg(unix)]
use crate::commands::browser::{browser, browsers, zap_call, zap_nodes};
use crate::commands::engines::{engine_probe, engines_discover};
use crate::commands::fetch::{get_request, post_request};
use crate::commands::galxe::galxe_generate_proof;
use crate::commands::hardware::hardware_get_summary;
use crate::commands::knowledge_graph::{
    knowledge_graph_get_ontology, knowledge_graph_query_entity, knowledge_graph_read_local,
    knowledge_graph_sync_apple, knowledge_graph_update_convo,
};
use crate::commands::hanzo_node_manager_commands::{
    hanzo_node_get_default_model, hanzo_node_get_default_embedding_model,     hanzo_node_get_options, hanzo_node_is_running,
    hanzo_node_kill, hanzo_node_remove_storage, hanzo_node_set_default_options,
    hanzo_node_set_options, hanzo_node_spawn, show_hanzo_node_manager_window,
    hanzo_node_open_storage_location, hanzo_node_open_storage_location_with_path,
    hanzo_node_open_chat_folder,
    // @hanzo/ai SDK canonical command names (delegate to the hanzo impls above)
    node_spawn, node_is_running, node_kill, node_get_options, node_set_options,
    node_set_default_options, node_get_default_model, node_get_default_embedding_model,
    node_remove_storage, show_node_manager_window,
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
use crate::commands::gpu::{
    gpu_connect_get_state, gpu_connect_start, gpu_connect_stop, GpuConnectManager,
};
use crate::commands::studio::{studio_get_state, studio_start, studio_stop, StudioManager};
use crate::commands::logs::{download_logs, retrieve_logs};
use crate::commands::mining::{
    mining_get_balance, mining_get_history, mining_get_local_pending, mining_get_state,
    mining_get_wallet_address, mining_set_privacy, mining_start, mining_stop,
};
use crate::commands::secure_storage::{
    init_secure_storage, secure_storage_delete, secure_storage_get, secure_storage_set,
};
use crate::commands::spotlight_commands::{hide_spotlight_window_app, show_spotlight_window_app, open_main_window_with_path_app};
use crate::commands::local_workspace::{
    local_workspace_open_dialog, local_workspace_open_file_dialog, local_workspace_clone_repo,
    local_workspace_import_file, local_workspace_list, local_workspace_read_file,
    local_workspace_write_file, local_workspace_create_file, local_workspace_create_dir,
    local_dev_setup_cancel, local_workspace_delete, local_workspace_discover, local_workspace_run_dev,
};
use crate::commands::local_site::{
    local_preview_open, local_preview_start, local_preview_stop, local_site_capture, local_site_folder,
};
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
mod local_dev;
mod local_hanzo_node;
mod local_models;
mod identity;
mod loopback;
#[cfg(feature = "machine")]
mod machine;
mod mining;
mod model_tools;
mod models;
mod studio_proxy;
mod tray;
mod windows;
// Native Hanzo Engine (in-process mistral.rs fork). Compiled only with the
// `native-engine` feature; the default build keeps using the node
// sidecars and skips the heavy inference stack entirely.
#[cfg(feature = "native-engine")]
mod embedded_engine;

#[derive(Clone, serde::Serialize)]
struct Payload {
    args: Vec<String>,
    cwd: String,
}

/// Before the `ai.hanzo.<app>` identifier scheme this app stored its data under
/// `com.hanzo.desktop`. Moves that directory into place the first time the new
/// one is needed; an existing new directory is never touched.
fn migrate_legacy_data_dir(app_data_dir: &std::path::Path) {
    let Some(parent) = app_data_dir.parent() else { return };
    let legacy = parent.join("com.hanzo.desktop");
    if app_data_dir.exists() || !legacy.is_dir() {
        return;
    }
    if let Err(e) = std::fs::rename(&legacy, app_data_dir) {
        log::warn!("could not move {:?} to {:?}: {}", legacy, app_data_dir, e);
    }
}

fn main() {
    // NVIDIA/Linux + WebKitGTK render a blank window with the default DMABUF
    // renderer on many driver combos; fall back to the non-DMABUF path unless
    // the user already configured it. Must run before any webview is created.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    let _ = fix_path_env::fix();
    // Stand for this user's ZAP router, as every hanzo-mcp does, so the
    // browser commands reach the extension with or without one running.
    #[cfg(unix)]
    zapd::embed();
    let context = tauri::generate_context!();
    // Older builds wrote sidecar key material (and other credentials) to the
    // log in plaintext. Redact whatever is still on disk before the log
    // plugin opens the file again. Best effort: a failure here must not stop
    // the app from starting.
    if let Some(dir) = hanzo_log_redact::app_log_dir(&context.config().identifier) {
        let _ = hanzo_log_redact::scrub_log_dir(&dir);
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let _ = recreate_window(app.clone(), Window::Main, true);
            app.emit("single-instance", Payload { args: argv, cwd })
                .unwrap();
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .format(|out, message, record| {
                    // Every record, the app's own and each sidecar line, is
                    // redacted here: this is the one place all of them pass.
                    let message = message.to_string();
                    let message = hanzo_log_redact::redact(&message);
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
        // Studio's engine calls, forwarded to studio.hanzo.ai (whose CORS
        // admits no window origin). See studio_proxy.rs.
        .register_asynchronous_uri_scheme_protocol(studio_proxy::SCHEME, |ctx, req, responder| {
            studio_proxy::handle(ctx, req, responder)
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                // Shortcuts are registered NON-FATALLY in setup() instead of via
                // with_shortcuts(), which registers at plugin init and PANICS if
                // another running brand (same app, different brand) already holds
                // the system-wide hotkey. A conflict must not crash the app.
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
        // A window never leaves the app for another origin. The main window
        // is hanzo.ai's app, whose links, sign-out and checkout name pages on
        // the web; a navigation to one opens in the system browser instead of
        // replacing the app with a web page.
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("away")
                .on_navigation(|_, url| {
                    let host = url.host_str().unwrap_or("");
                    let path = url.path();
                    let embedded_frame =
                        ((host == "api.hanzo.ai" || host == "api-dev.hanzo.ai")
                            && (path.starts_with("/v1/sandboxes/") || path.starts_with("/v1/sandbox/")))
                        || host.ends_with(".share.hanzo.ai")
                        || host.ends_with(".zt.hanzo.ai")
                        || host.ends_with(".hanzo.app")
                        || host == "tabs.hanzo.ai"
                        || host == "hanzo-studio.localhost";
                    let local = matches!(url.scheme(), "tauri" | "asset" | "ipc" | "data" | "blob" | "about")
                        || matches!(host, "tauri.localhost" | "ipc.localhost" | "localhost" | "127.0.0.1")
                        || embedded_frame;
                    if !local {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    local
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            loopback::iam_loopback,
            identity::identity_adopt,
            identity::identity_file,
            local_dev::dev_local_runtime,
            local_dev::dev_local_pairing,
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
                        hanzo_node_get_default_model,
            hanzo_node_get_default_embedding_model,
            // @hanzo/ai SDK canonical command names
            node_spawn,
            node_is_running,
            node_kill,
            node_get_options,
            node_set_options,
            node_set_default_options,
            node_get_default_model,
            node_get_default_embedding_model,
            node_remove_storage,
            show_node_manager_window,
            hardware_get_summary,
            local_models::local_models_status,
            local_models::local_models_pull,
            local_models::local_models_cancel,
            local_models::local_models_remove,
            local_models::local_models_serve,
            local_models::local_models_stop,
            knowledge_graph_read_local,
            knowledge_graph_sync_apple,
            knowledge_graph_query_entity,
            knowledge_graph_update_convo,
            knowledge_graph_get_ontology,
            galxe_generate_proof,
            get_request,
            post_request,
            engines_discover,
            engine_probe,
            #[cfg(unix)]
            browser,
            #[cfg(unix)]
            browsers,
            #[cfg(unix)]
            zap_nodes,
            #[cfg(unix)]
            zap_call,
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
            gpu_connect_get_state,
            gpu_connect_start,
            gpu_connect_stop,
            studio_get_state,
            studio_start,
            studio_stop,
            secure_storage_set,
            secure_storage_get,
            secure_storage_delete,
            local_workspace_open_dialog,
            local_workspace_open_file_dialog,
            local_workspace_clone_repo,
            local_workspace_import_file,
            local_workspace_list,
            local_workspace_read_file,
            local_workspace_write_file,
            local_workspace_create_file,
            local_workspace_create_dir,
            local_workspace_delete,
            local_workspace_run_dev,
            local_workspace_discover,
            local_dev_setup_cancel,
            local_site_folder,
            local_site_capture,
            local_preview_start,
            local_preview_stop,
            local_preview_open,
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
            migrate_legacy_data_dir(&app_data_dir);

            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let gs = app.global_shortcut();
                // No ⇧⌘J: Spotlight is not created until it can send (see below).
                for s in ["super+shift+i", "control+shift+i"] {
                    if let Err(e) = gs.register(s) {
                        log::warn!("global shortcut '{}' not registered (already held by another app?): {}", s, e);
                    }
                }
            }

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

            // "Share this device's GPU with Hanzo Cloud" toggle: Arc-managed
            // managers that spawn/stop the light Rust `hanzo-fleet-worker`
            // (commands/gpu.rs) and the local studio render child
            // (commands/studio.rs). The frontend hook drives both together.
            app.manage(Arc::new(GpuConnectManager::new()));
            app.manage(Arc::new(StudioManager::new()));

            // Initialize secure storage (OS keyring with in-memory fallback)
            let secure_store = init_secure_storage();
            app.manage(secure_store);

            create_tray(app.handle())?;
            setup_deep_links(app.handle())?;

            // What an earlier run that ended without its exit hook (a crash, a
            // force quit) left: a served engine holding the port, and a cut-off
            // download no screen lists.
            local_models::at_start(app_data_dir.clone());

            // Native app & File menu so Settings… (⌘,) and New Chat (⌘N) live in the
            // macOS menu bar instead of a bottom-left sidebar cog.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
                let settings_app = MenuItemBuilder::with_id("open_settings", "Settings…")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;
                let new_chat = MenuItemBuilder::with_id("new_chat", "New Chat")
                    .accelerator("CmdOrCtrl+N")
                    .build(app)?;
                let settings_file = MenuItemBuilder::with_id("open_settings_file", "Settings…")
                    .build(app)?;

                let app_sub = SubmenuBuilder::new(app, "Hanzo")
                    .about(None)
                    .separator()
                    .item(&settings_app)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                let close_tab_or_window = MenuItemBuilder::with_id("close_tab_or_window", "Close Tab / Window")
                    .accelerator("CmdOrCtrl+W")
                    .build(app)?;
                let file_sub = SubmenuBuilder::new(app, "File")
                    .item(&new_chat)
                    .separator()
                    .item(&settings_file)
                    .separator()
                    .item(&close_tab_or_window)
                    .build()?;
                let edit_sub = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let split_vertical = MenuItemBuilder::with_id("tabs_split_vertical", "Split Pane Vertically")
                    .accelerator("CmdOrCtrl+D")
                    .build(app)?;
                let split_horizontal = MenuItemBuilder::with_id("tabs_split_horizontal", "Split Pane Horizontally")
                    .accelerator("CmdOrCtrl+Shift+D")
                    .build(app)?;
                let view_sub = SubmenuBuilder::new(app, "View")
                    .item(&split_vertical)
                    .item(&split_horizontal)
                    .separator()
                    .fullscreen()
                    .build()?;
                let window_sub = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .item(&PredefinedMenuItem::maximize(app, None)?)
                    .build()?;

                let menubar = MenuBuilder::new(app)
                    .item(&app_sub)
                    .item(&file_sub)
                    .item(&edit_sub)
                    .item(&view_sub)
                    .item(&window_sub)
                    .build()?;
                app.set_menu(menubar)?;
                app.on_menu_event(|app_handle, event| {
                    match event.id().as_ref() {
                        "open_settings" | "open_settings_file" => {
                            let _ = recreate_window(app_handle.clone(), Window::Main, true);
                            let _ = app_handle.emit("navigate-to-path", "/settings");
                        }
                        "new_chat" => {
                            let _ = recreate_window(app_handle.clone(), Window::Main, true);
                            let _ = app_handle.emit("create-chat", ());
                        }
                        "tabs_split_vertical" => {
                            let _ = app_handle.emit("tabs-split", "row");
                        }
                        "tabs_split_horizontal" => {
                            let _ = app_handle.emit("tabs-split", "col");
                        }
                        "close_tab_or_window" => {
                            let _ = app_handle.emit("close-active-tab", ());
                        }
                        _ => {}
                    }
                });
            }

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
                    // Only the main window. Spotlight's quick ask still sends through the
                    // retired hanzo-node (it showed "Unable to connect" and Send did
                    // nothing), and the hidden Coordinator only synced that window's
                    // legacy stores; each cost a webview process at every launch.
                    let _ = recreate_window(app_handle.clone(), Window::Main, true);

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

                    // Ensure local hanzo-site service is reachable on port 3000 (Linux systemd)
                    #[cfg(target_os = "linux")]
                    if std::net::TcpStream::connect("127.0.0.1:3000").is_err() {
                        log::info!("local hanzo-site not reachable on port 3000, ensuring systemd user service is up...");
                        let _ = std::process::Command::new("systemctl")
                            .args(["--user", "start", "hanzo-site.service"])
                            .spawn();
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
        .build(context)
        .expect("error while running tauri application")
        .run(move |app_handle, event| match event {
            RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            RunEvent::Exit { .. } => {
                commands::local_site::stop_all();
                // A model the person chose to run stops with the app.
                local_models::stop_all();
                tauri::async_runtime::spawn(async {
                    log::debug!("killing hanzo-node before exit");

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
                let _ = recreate_window(app_handle.clone(), Window::Main, true);
            }
            // A preview serves for the window that asked for it: the window closing ends it.
            RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } if label == Window::Main.as_str() => {
                commands::local_site::stop_all();
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
