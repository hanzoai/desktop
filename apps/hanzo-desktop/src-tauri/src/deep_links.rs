use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;

use crate::windows::{recreate_window, Window};

/// Brands whose sign-in comes back here, by name. libs/brand-config is the one
/// brand table; the test below holds this list to it.
pub(crate) const IAM_BRANDS: [&str; 3] = ["hanzo", "zoo", "lux"];

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
                        // Any other oauth link went to the hidden Coordinator's
                        // legacy-node listener, which is gone; nothing else asks.
                        None => log::debug!("ignoring oauth deep link for no brand: {:?}", url),
                    }
                }
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::IAM_BRANDS;

    /// The list above is the brand table's, not a second one: every brand in
    /// libs/brand-config with a callback event, and nothing else.
    #[test]
    fn the_brands_are_the_brand_table_s() {
        let table = include_str!("../../../../libs/brand-config/src/index.ts");
        let mut from_table: Vec<&str> = table
            .split("callbackEvent: '")
            .skip(1)
            .filter_map(|s| s.split('\'').next()?.strip_suffix("-iam-callback"))
            .collect();
        from_table.sort();
        let mut here = IAM_BRANDS.to_vec();
        here.sort();
        assert!(!from_table.is_empty(), "the brand table names no callback event");
        assert_eq!(here, from_table);
    }
}
