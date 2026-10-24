use tauri::{utils::config::BackgroundThrottlingPolicy, AppHandle, Error, Manager, WebviewWindow, WebviewWindowBuilder, Emitter};

mod microphone;

#[derive(Debug, Clone, Copy)]
pub enum Window {
    Main,
    HanzoNodeManager,
    Spotlight,
    Coordinator,
}

impl Window {
    pub fn as_str(&self) -> &'static str {
        match self {
            Window::Main => "main",
            Window::HanzoNodeManager => "hanzo-node-manager",
            Window::Spotlight => "spotlight",
            Window::Coordinator => "coordinator",
        }
    }
}

pub fn get_window(app_handle: AppHandle, window_name: Window, focus: bool) -> tauri::Result<WebviewWindow> {
    let label = window_name.as_str();
    if let Some(window) = app_handle.get_webview_window(label) {
        log::info!("window {} found, bringing to front", label);
        if focus {
            log::info!("focusing window {}", label);
            if window.is_minimized().unwrap_or_default() {
                let _ = window.unminimize();
            }
            window.show().unwrap();
            // window.center().unwrap();
            let _ = window.set_focus();
        }
        return Ok(window);
    }
    log::info!("window {} not found", label);
    Err(Error::WindowNotFound)
}

pub fn recreate_window(app_handle: AppHandle, window_name: Window, focus: bool) -> tauri::Result<WebviewWindow> {
    let label = window_name.as_str();
    if let Some(window) = app_handle.get_webview_window(label) {
        log::info!("window {} found, bringing to front", label);
        if focus {
            log::info!("focusing window {}", label);
            if window.is_minimized().unwrap_or_default() {
                let _ = window.unminimize();
            }
            window.show().unwrap();
            // window.center().unwrap();
            let _ = window.set_focus();
        }
        Ok(window)
    } else {
        log::info!("window {} not found, recreating...", label);
        let mut window_config = app_handle
            .config()
            .app
            .windows
            .iter()
            .find(|w| w.label == label)
            .unwrap()
            .clone();
        if window_config.label == Window::Coordinator.as_str() {
            window_config.background_throttling = Some(BackgroundThrottlingPolicy::Disabled);
        }
        #[cfg(target_os = "linux")]
        {
            if window_config.label == Window::Main.as_str() {
                window_config.transparent = false;
                window_config.decorations = true;
            }
        }
        match WebviewWindowBuilder::from_config(&app_handle, &window_config) {
            Ok(builder) => match builder.build() {
                Ok(window) => {
                    log::info!("window {} created", label);
                    microphone::permit(&window);
                    if focus {
                        log::info!("focusing newly created window {}", label);
                        if window.is_minimized().unwrap_or_default() {
                            let _ = window.unminimize();
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    Ok(window)
                }
                Err(e) => {
                    log::error!("failed to recreate window: {}", e);
                    Err(e)
                },
            },
            Err(e) => {
                log::error!("failed to recreate window from config: {}", e);
                Err(e)
            }
        }
    }
}

pub fn hide_spotlight_window(app_handle: AppHandle) {
    if let Some(window) = app_handle.get_webview_window(Window::Spotlight.as_str()) {
        window.hide().unwrap();
    }
}

pub fn show_spotlight_window(app_handle: AppHandle) {
    if let Some(window) = app_handle.get_webview_window(Window::Spotlight.as_str()) {
        window.show().unwrap();
    }
}

pub fn open_main_window_with_path(app_handle: AppHandle, path: String) {
    match recreate_window(app_handle.clone(), Window::Main, true) {
        Ok(window) => {
            let target_url = if path.starts_with("http://") || path.starts_with("https://") {
                path.clone()
            } else {
                format!("http://localhost:3000{}", if path.starts_with('/') { path.clone() } else { format!("/{}", path) })
            };
            if let Ok(parsed_url) = target_url.parse() {
                let _ = window.navigate(parsed_url);
            }
            if let Err(e) = app_handle.emit_to(Window::Main.as_str(), "navigate-to-path", path) {
                log::error!("failed to emit 'navigate-to-path': {}", e);
            }
            let _ = window.show();
            if let Err(e) = window.set_focus() {
                log::error!("failed to set focus: {}", e);
            }
        }
        Err(e) => {
            log::error!("failed to recreate main window: {}", e);
        }
    }
}
