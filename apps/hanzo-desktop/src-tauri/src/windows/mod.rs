use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

mod microphone;

#[derive(Debug, Clone, Copy)]
pub enum Window {
    Main,
}

impl Window {
    pub fn as_str(&self) -> &'static str {
        match self {
            Window::Main => "main",
        }
    }
}

/// Where the main window's page comes from.
///
/// The window hosts hanzo.ai's app ITSELF (`src/host.tsx` mounts @hanzo/app),
/// so it loads this repository's frontend and never hanzo.ai's dev server on
/// :3000. `tauri dev` loads the Vite server `tauri.conf.json`'s `devUrl`
/// names; a bundled build loads the `frontendDist` the config ships. `path`
/// is the address the app opens on, which is the app's own (`/chat`), not a
/// page of the marketing site.
fn main_url(path: &str) -> tauri::WebviewUrl {
    let path = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
    if let Some(dev) = dev_base() {
        if let Ok(url) = format!("{dev}{path}").parse() {
            return tauri::WebviewUrl::External(url);
        }
    }
    // A bundled app serves its own index; the path is read from the window's
    // history by the app's router (`host.tsx`), which treats `/index.html` as
    // the address it started on.
    tauri::WebviewUrl::App("index.html".into())
}

/// The Vite server `tauri dev` is served from, or None in a bundled build.
///
/// `dev`, not `debug_assertions`: a debug BUNDLE (`tauri build --debug`, which
/// is also `pnpm e2e:build`) ships its frontend and has no Vite server to load,
/// so its main window was a blank page; and its pages are only the app's own
/// (the capabilities' `local`) when they come from the bundle.
fn dev_base() -> Option<&'static str> {
    if cfg!(dev) {
        Some(option_env!("DEV_SERVER_URL").unwrap_or("http://localhost:1420"))
    } else {
        None
    }
}

/// What a top-level navigation of the window does: stay, go to the system
/// browser, or nothing at all.
#[derive(Debug, PartialEq)]
pub enum Navigation {
    Stay,
    Browser,
    Refuse,
}

/// Only the app's own origin stays in the window: `tauri://localhost` (macOS,
/// Linux), `http(s)://tauri.localhost` (Windows), and in a dev build the dev
/// server's origin. A registered scheme such as `hanzo-studio://localhost` is the
/// app's own to Tauri, so it would load with every grant the window holds; any
/// address that is not the app's is never a page here. A web address opens in the
/// system browser; anything else is refused.
pub fn navigation(url: &tauri::Url, dev: Option<&str>) -> Navigation {
    let own = match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => url.port().is_none(),
        ("http" | "https", Some("tauri.localhost")) => url.port().is_none(),
        _ => dev.and_then(|d| tauri::Url::parse(d).ok()).is_some_and(|d| d.origin() == url.origin()),
    };
    if own {
        Navigation::Stay
    } else if matches!(url.scheme(), "http" | "https") {
        Navigation::Browser
    } else {
        Navigation::Refuse
    }
}

/// `navigation` for this build: the dev server is the app's own only under `tauri dev`.
pub fn navigate(url: &tauri::Url) -> Navigation {
    navigation(url, dev_base())
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
        if window_config.label == Window::Main.as_str() {
            window_config.url = main_url(
                option_env!("DEV_START_PATH").unwrap_or("/chat"),
            );
            window_config.transparent = true;
            // The window keeps macOS's own controls: the lights sit over the
            // page (Overlay), and the app's bar reserves their corner.
            window_config.decorations = true;
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

#[cfg(test)]
mod tests {
    use super::{navigation, Navigation};

    fn at(s: &str, dev: Option<&str>) -> Navigation {
        navigation(&s.parse().unwrap(), dev)
    }

    #[test]
    fn only_the_apps_own_origin_is_a_page_in_the_window() {
        for own in ["tauri://localhost/chat", "http://tauri.localhost/settings", "https://tauri.localhost/"] {
            assert_eq!(at(own, None), Navigation::Stay, "{own}");
        }
        assert_eq!(at("http://localhost:1420/chat", Some("http://localhost:1420")), Navigation::Stay);
    }

    #[test]
    fn a_registered_scheme_or_another_local_address_never_loads_as_the_window() {
        for scheme in ["hanzo-studio://localhost/v1/documents", "asset://localhost/x.html", "ipc://localhost/x", "data:text/html,x", "blob:tauri://localhost/x", "about:blank"] {
            assert_eq!(at(scheme, Some("http://localhost:1420")), Navigation::Refuse, "{scheme}");
        }
        for web in ["http://localhost:1420/chat", "http://localhost:3000/", "http://127.0.0.1:8080/", "https://hanzo.ai/pricing", "http://tauri.localhost:9/x"] {
            assert_eq!(at(web, None), Navigation::Browser, "{web}: not a dev build");
        }
        assert_eq!(at("http://localhost:3000/", Some("http://localhost:1420")), Navigation::Browser, "another port is not the dev server");
    }
}
