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
      glib::prelude::Cast, PermissionRequestExt, UserMediaPermissionRequest,
      UserMediaPermissionRequestExt, WebViewExt,
    };

    if let Err(e) = window.with_webview(|webview| {
      webview.inner().connect_permission_request(|_, request| {
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
