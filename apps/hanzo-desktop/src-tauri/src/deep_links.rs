use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;

use crate::windows::{recreate_window, Window};

/// Brands whose IAM issues a `<scheme>://oauth/<brand>` redirect. Mirrors the
/// `Brand` union and the `iam.redirectUri` column in libs/brand-config.
const IAM_BRANDS: [&str; 3] = ["hanzo", "zoo", "lux"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct OAuthDeepLinkPayload {
    pub state: String,
    pub code: String,
}

pub fn setup_deep_links(app: &tauri::AppHandle) -> tauri::Result<()> {
    #[cfg(any(windows, target_os = "linux"))]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link()
            .register_all()
            .map_err(|e| tauri::Error::Anyhow(e.into()))?;
    }
    let app_handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls: Vec<_> = event.urls().into_iter().collect();
        log::debug!("deep link URLs: {:?}", urls);
        for url in urls {
            log::debug!("handling deep link: {:?}", url);
            if let Some(host) = url.host() {
                // Only sign-in comes back on a deep link. `store` and `config`
                // links emitted events no window listened for, so they are gone.
                if host.to_string() == "oauth" {
                    log::debug!("oauth deep link: {:?}", url);
                    let query_pairs = url.query_pairs().collect::<Vec<_>>();
                    let state = query_pairs
                        .iter()
                        .find(|(key, _)| key == "state")
                        .map(|(_, value)| value.to_string())
                        .unwrap_or_default();
                    let code = query_pairs
                        .iter()
                        .find(|(key, _)| key == "code")
                        .map(|(_, value)| value.to_string())
                        .unwrap_or_default();
                    let payload = OAuthDeepLinkPayload { state, code };
                    // IAM login callback (`<scheme>://oauth/<brand>`) vs provider
                    // OAuth. The brand is the path segment, and the event is that
                    // brand's `iam.callbackEvent` from libs/brand-config —
                    // `<brand>-iam-callback`. Deriving it instead of hardcoding
                    // "hanzo" is what lets one binary serve all three brands: a
                    // Zoo build round-trips zoo://oauth/zoo and emits
                    // zoo-iam-callback, which is the only event its login hook
                    // listens for. Hardcoding hanzo made Lux and Zoo logins fall
                    // through to the provider-OAuth branch and hang.
                    match IAM_BRANDS
                        .iter()
                        .find(|brand| url.path().trim_start_matches('/') == **brand)
                    {
                        Some(brand) => {
                            let event = format!("{}-iam-callback", brand);
                            log::debug!("emitting {} event globally", event);
                            let _ = recreate_window(app_handle.clone(), Window::Main, true);
                            let _ = app_handle.emit(&event, payload);
                        }
                        None => {
                            log::debug!("emitting oauth-deep-link event to all windows");
                            let _ = recreate_window(app_handle.clone(), Window::Main, true);
                            let _ = app_handle.emit("oauth-deep-link", payload);
                        }
                    }
                }
            }
        }
    });
    Ok(())
}
