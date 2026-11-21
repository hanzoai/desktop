// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

#[cfg(unix)]
use crate::commands::browser::{browser, browsers};
use crate::commands::engines::{engine_probe, engines_discover};
use crate::commands::galxe::galxe_generate_proof;
use crate::commands::hardware::hardware_get_summary;
use crate::commands::knowledge_graph::{
    knowledge_graph_get_ontology, knowledge_graph_query_entity, knowledge_graph_read_local,
    knowledge_graph_sync_apple, knowledge_graph_update_convo,
};
use crate::commands::gpu::{
    gpu_connect_get_state, gpu_connect_start, gpu_connect_stop, GpuConnectManager,
};
use crate::commands::studio::{studio_get_state, studio_start, studio_stop, StudioManager};
use crate::commands::mining::{
    mining_get_enabled, mining_set_enabled,
};
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
use deep_links::setup_deep_links;
use global_shortcuts::global_shortcut_handler;
use tauri::{Emitter, WindowEvent};
use tauri::{Manager, RunEvent};
use tray::create_tray;
use windows::{recreate_window, Window};
mod commands;
mod deep_links;
mod galxe;
mod global_shortcuts;
mod hardware;
mod local_dev;
mod local_models;
mod identity;
mod loopback;
#[cfg(feature = "machine")]
mod machine;
mod mining;
mod report;
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
                    let local = matches!(url.scheme(), "tauri" | "asset" | "ipc" | "data" | "blob" | "about")
                        || matches!(url.host_str(), Some("tauri.localhost" | "ipc.localhost" | "localhost" | "127.0.0.1"));
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
            report::report_redact,
            identity::identity_adopt,
            identity::identity_file,
            local_dev::dev_local_runtime,
            local_dev::dev_local_pairing,
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
            engines_discover,
            engine_probe,
            #[cfg(unix)]
            browser,
            #[cfg(unix)]
            browsers,
            mining_get_enabled,
            mining_set_enabled,
            gpu_connect_get_state,
            gpu_connect_start,
            gpu_connect_stop,
            studio_get_state,
            studio_start,
            studio_stop,
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
        ])
        .setup(|app| {
            log::info!("starting app version: {}", env!("CARGO_PKG_VERSION"));
            let app_data_dir = app.path().app_data_dir()?;
            migrate_legacy_data_dir(&app_data_dir);

            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let gs = app.global_shortcut();
                for s in ["super+shift+i", "control+shift+i"] {
                    if let Err(e) = gs.register(s) {
                        log::warn!("global shortcut '{}' not registered (already held by another app?): {}", s, e);
                    }
                }
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

            create_tray(app.handle())?;
            setup_deep_links(app.handle())?;

            // What an earlier run that ended without its exit hook (a crash, a
            // force quit) left: a served engine holding the port, and a cut-off
            // download no screen lists.
            local_models::at_start(app_data_dir.clone());

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
                    // The main window is the app's only window.
                    let _ = recreate_window(app_handle.clone(), Window::Main, true);

                    // Ensure local hanzo-site service is reachable on port 3000 (Linux systemd)
                    #[cfg(target_os = "linux")]
                    if std::net::TcpStream::connect("127.0.0.1:3000").is_err() {
                        log::info!("local hanzo-site not reachable on port 3000, ensuring systemd user service is up...");
                        let _ = std::process::Command::new("systemctl")
                            .args(["--user", "start", "hanzo-site.service"])
                            .spawn();
                    }

                    // Mining uses this computer's power and electricity, so it
                    // runs only if the person turned it on (Settings > Advanced,
                    // `mining_set_enabled`); a new install is off. Then it resumes
                    // at boot with the per-install dev wallet. chain_id 96369 is
                    // the precompile's brand-agnostic default.
                    let mining_manager = app_handle.state::<std::sync::Arc<MiningManager>>();
                    if mining_manager.is_enabled() {
                        let wallet = mining_manager.ensure_dev_wallet();
                        mining_manager
                            .start_mining(app_handle.clone(), wallet, 96369)
                            .await;
                        log::info!("resumed Phase-1 mining: the person turned it on");
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
                std::process::exit(0);
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
            _ => {}
        });
}
