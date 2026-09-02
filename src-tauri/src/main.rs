#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod secret;
mod service;
mod tray;

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

/// The window somebody works in.
const MAIN: &str = "main";
/// The window that shows what this machine is running.
const SERVICES: &str = "services";

/// The app's own route for a returning sign-in, and the one the web build uses.
const CALLBACK: &str = "/auth/callback";

/// Bring the app forward. A sign-in coming back is worth a window, and so is a
/// tray item.
fn raise(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Put the app on one of its own addresses, and bring it forward.
///
/// This is the whole of what the shell says TO the app: it rewrites the
/// document's address, which is what a link does, so the screens answer the
/// same way whether the router or the operating system asked for them. The
/// address it rewrites is the document's own, so it is the dev server while
/// developing and `tauri://localhost` in a bundle without either being written
/// down — and an unmatched path there serves `index.html`, which is what makes
/// a client-side route reachable from outside the client.
fn go(app: &AppHandle, path: &str, query: Option<&str>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        if let Ok(mut url) = window.url() {
            url.set_path(path);
            url.set_query(query);
            let _ = window.navigate(url);
        }
    }
    raise(app);
}

/// The services window: built the first time it is asked for, raised after
/// that. It is a document of its own rather than a route, because it outlives
/// wherever the main window happens to be.
fn services(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SERVICES) {
        window.show()?;
        return window.set_focus();
    }
    WebviewWindowBuilder::new(app, SERVICES, WebviewUrl::App("services.html".into()))
        .title("Local services")
        .inner_size(880.0, 640.0)
        .min_inner_size(560.0, 400.0)
        .build()?;
    Ok(())
}

/// Open the services window. The settings screen and the tray ask for the same
/// one.
#[tauri::command]
fn manage(app: AppHandle) -> Result<(), String> {
    services(&app).map_err(|e| e.to_string())
}

fn main() {
    // WebKitGTK's dmabuf renderer allocates nothing under the NVIDIA driver —
    // `DRM_IOCTL_MODE_CREATE_DUMB` is refused and the window paints an empty
    // rectangle — so the app is unusable and says nothing about why. Set before
    // a webview exists, and only where nobody has already answered.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        // Opening `hanzo://…` starts a process. Without this it would be a
        // second copy of the app, and the verifier that began the round trip
        // lives in the first.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| raise(app)))
        .plugin(tauri_plugin_deep_link::init())
        // Sign-in leaves for the browser, where the visitor's session already
        // is and where an address bar can be read.
        .plugin(tauri_plugin_opener::init())
        .manage(service::Registry::default())
        .invoke_handler(tauri::generate_handler![
            manage,
            secret::keep,
            secret::secret,
            service::logs,
            service::spawn,
            service::status,
            service::stop
        ])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            // A sign-in returning from the browser. The operating system hands
            // the app `hanzo://oauth/<brand>?code=…&state=…`; its parameters go
            // to the app's own callback route, where the verifier that began
            // the round trip is waiting. One way to finish a sign-in, and the
            // desktop takes the same one the web does.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    go(&handle, CALLBACK, url.query());
                }
            });

            tray::install(app.handle())?;
            service::boot(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("cannot build the app")
        .run(|app, event| match event {
            // Closing the last window leaves the app in the tray. Quit is a
            // decision, and the tray is where it is made.
            RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
            RunEvent::Exit => app.state::<service::Registry>().clear(),
            _ => {}
        });
}
