//! Answering the page when it asks for the microphone.
//!
//! Each webview asks its host before handing a page `getUserMedia`, and each
//! host answers somewhere different. WKWebView asks wry, which grants; WebView2
//! asks nobody and shows its own prompt. WebKitGTK emits `permission-request`,
//! and its default handler DENIES — so on Linux the answer has to come from
//! here, or the microphone is refused with no error anyone can see.
//!
//! The OS gate is still the OS gate: macOS runs this past TCC and the usage
//! string in Info.plist, Windows past the system microphone setting. This only
//! answers the webview's own question.

use tauri::WebviewWindow;

/// Let this window's page open the microphone. Audio only — this app asks for a
/// microphone, never a camera, and a page that asks for one is refused.
pub fn permit(window: &WebviewWindow) {
  #[cfg(target_os = "linux")]
  {
    use webkit2gtk::{
      glib::prelude::Cast, PermissionRequestExt, UserContentInjectedFrames,
      UserContentManagerExt, UserMediaPermissionRequest,
      UserMediaPermissionRequestExt, UserStyleLevel, UserStyleSheet, WebViewExt,
    };

    if let Err(e) = window.with_webview(|webview| {
      let inner = webview.inner();
      if let Some(manager) = inner.user_content_manager() {
        let style = UserStyleSheet::new(
          r#"
          :root { --desktop-window-radius: 14px; }
          :root:not(.light) {
            --background: #0d0d0d;
            --pane-floor: #090909;
            --pane-fill: #111111;
            --composer-fill: #181818;
            --composer-ground: #181818;
          }
          html[data-maximized="true"] { --desktop-window-radius: 0px; }
          html { background: transparent !important; background-color: transparent !important; }
          body {
            border-radius: var(--desktop-window-radius) !important;
            clip-path: inset(0 round var(--desktop-window-radius));
            overflow: hidden !important;
          }
          html:not([data-maximized="true"]) body::after {
            content: "";
            position: fixed;
            inset: 0;
            border-radius: var(--desktop-window-radius);
            border: 1px solid rgba(255, 255, 255, 0.085);
            pointer-events: none;
            z-index: 2147483646;
          }
          [data-slot="chat-empty-flow"] [data-slot="chat"] {
            height: auto !important;
            grid-template-rows: auto auto !important;
          }
          :root:not(.light) [data-slot="composer"],
          :root:not(.light) [data-slot="composer"].glass {
            --composer-edge: rgba(255, 255, 255, 0.095) !important;
            background: var(--composer-fill, #181818) !important;
            background-color: var(--composer-fill, #181818) !important;
            border-color: rgba(255, 255, 255, 0.095) !important;
            border-radius: 16px !important;
          }
          "#,
          UserContentInjectedFrames::TopFrame,
          UserStyleLevel::User,
          &[],
          &[],
        );
        manager.add_style_sheet(&style);
      }
      inner.connect_permission_request(|_, request| {
        let Some(media) = request.downcast_ref::<UserMediaPermissionRequest>() else {
          return false;
        };
        if media.is_for_video_device() || !media.is_for_audio_device() {
          media.deny();
        } else {
          media.allow();
        }
        true
      });
    }) {
      log::error!("microphone requests will be denied on this window: {}", e);
    }
  }

  #[cfg(not(target_os = "linux"))]
  let _ = window;
}
