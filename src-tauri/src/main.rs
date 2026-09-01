#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod service;

use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_deep_link::DeepLinkExt;

/// Bring the app forward. A callback arriving from the browser is worth a
/// window.
fn raise(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // Opening `hanzo://…` starts a process. Without this it would be a
        // second copy of the app, and the verifier that began the round trip
        // lives in the first.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| raise(app)))
        .plugin(tauri_plugin_deep_link::init())
        .manage(service::Registry::default())
        .invoke_handler(tauri::generate_handler![
            service::spawn,
            service::stop,
            service::status
        ])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            // The URL is passed on whole. Which parameters mean a session is
            // the question the PKCE verifier answers, and it is in the window.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                raise(&handle);
                for url in event.urls() {
                    let _ = handle.emit("url", url.to_string());
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("cannot build the app")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<service::Registry>().clear();
            }
        });
}
