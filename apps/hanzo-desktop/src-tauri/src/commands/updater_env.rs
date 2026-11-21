//! Updater environment introspection for the frontend.
//!
//! The Tauri updater on Linux only knows how to update an **AppImage**: it
//! downloads the new `.AppImage`, verifies its minisign signature against the
//! configured pubkey, and atomically replaces the running file. For every other
//! Linux install shape — a `.deb`/`.rpm`, a system-wide copy under `/usr`, or a
//! `cargo tauri dev` build — there is nothing safe to self-replace, and the
//! update is "managed by your package manager".
//!
//! This command lets the frontend reason about that BEFORE attempting a
//! download, so it can no-op gracefully (no scary error toast) instead of
//! letting the updater fail mid-flight. It also reports whether the AppImage
//! path is writable (so we can surface a friendly "can't write, here's a manual
//! download link" notice) and whether we're running under the systemd service
//! (so the post-update restart can go through `systemctl` rather than a bare
//! process relaunch).

/// Description of how this build is installed + whether self-update is viable.
#[derive(Debug, Clone, serde::Serialize)]
pub struct UpdaterEnvironment {
    /// True when we can attempt a Tauri self-update (running as a writable
    /// AppImage on Linux, or any updatable target on macOS/Windows).
    pub can_self_update: bool,
    /// True specifically when launched from an AppImage (Linux only).
    pub is_appimage: bool,
    /// The `$APPIMAGE` path, when present.
    pub appimage_path: Option<String>,
    /// True when the AppImage file (or its directory) is writable by us, so an
    /// in-place atomic swap can succeed. Meaningless when `is_appimage` is false.
    pub appimage_writable: bool,
    /// True when running under our own systemd user unit (so updates should
    /// trigger `systemctl --user restart` instead of a process relaunch).
    pub under_systemd_service: bool,
    /// Coarse install kind for display: "appimage" | "deb-or-system" | "dev" |
    /// "macos" | "windows" | "unknown".
    pub install_kind: String,
    /// Human-readable note for the UI when self-update is unavailable.
    pub managed_note: Option<String>,
    /// Where to send users for a manual download when self-update can't proceed.
    pub manual_download_url: String,
}

const MANUAL_DOWNLOAD_URL: &str = "https://github.com/hanzoai/desktop/releases/latest";

#[tauri::command]
pub async fn updater_environment() -> Result<UpdaterEnvironment, String> {
    // Non-Linux: the bundled NSIS / .app updaters handle their own atomic
    // install, so self-update is always considered viable here.
    #[cfg(target_os = "macos")]
    {
        return Ok(UpdaterEnvironment {
            can_self_update: true,
            is_appimage: false,
            appimage_path: None,
            appimage_writable: false,
            under_systemd_service: false,
            install_kind: "macos".to_string(),
            managed_note: None,
            manual_download_url: MANUAL_DOWNLOAD_URL.to_string(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        return Ok(UpdaterEnvironment {
            can_self_update: true,
            is_appimage: false,
            appimage_path: None,
            appimage_writable: false,
            under_systemd_service: false,
            install_kind: "windows".to_string(),
            managed_note: None,
            manual_download_url: MANUAL_DOWNLOAD_URL.to_string(),
        });
    }

    #[cfg(target_os = "linux")]
    {
        let under_systemd_service = std::env::var("INVOCATION_ID").is_ok();

        // The Tauri/AppImage runtime sets $APPIMAGE to the .AppImage file path.
        // Its presence (and existence on disk) is the definitive signal.
        let appimage_path = std::env::var("APPIMAGE").ok().filter(|p| {
            !p.trim().is_empty() && std::path::Path::new(p).exists()
        });
        let is_appimage = appimage_path.is_some();

        // Dev builds: not bundled. `current_exe` lands under a `target/`
        // directory (debug/release) — treat as "dev" so we never nag.
        let is_dev_build = std::env::current_exe()
            .ok()
            .map(|p| {
                let s = p.to_string_lossy();
                s.contains("/target/debug/") || s.contains("/target/release/")
            })
            .unwrap_or(false);

        if let Some(ref path) = appimage_path {
            let writable = appimage_writable(path);
            let managed_note = if writable {
                None
            } else {
                Some(format!(
                    "Hanzo is installed at {path}, which isn't writable by this \
                     user. Download the latest AppImage manually to update."
                ))
            };
            return Ok(UpdaterEnvironment {
                can_self_update: writable,
                is_appimage: true,
                appimage_path: appimage_path.clone(),
                appimage_writable: writable,
                under_systemd_service,
                install_kind: "appimage".to_string(),
                managed_note,
                manual_download_url: MANUAL_DOWNLOAD_URL.to_string(),
            });
        }

        let (install_kind, managed_note) = if is_dev_build {
            (
                "dev",
                None, // dev: stay silent
            )
        } else {
            (
                "deb-or-system",
                Some(
                    "Hanzo was installed by your system package manager. \
                     Updates are delivered through it (e.g. apt/dnf)."
                        .to_string(),
                ),
            )
        };

        return Ok(UpdaterEnvironment {
            can_self_update: false,
            is_appimage: false,
            appimage_path: None,
            appimage_writable: false,
            under_systemd_service,
            install_kind: install_kind.to_string(),
            managed_note,
            manual_download_url: MANUAL_DOWNLOAD_URL.to_string(),
        });
    }

    // Fallback for any other target (and to give the function a return on every
    // platform — each cfg block above returns early, so this is only reached on
    // an otherwise unhandled OS).
    #[allow(unreachable_code)]
    return Ok(UpdaterEnvironment {
        can_self_update: false,
        is_appimage: false,
        appimage_path: None,
        appimage_writable: false,
        under_systemd_service: false,
        install_kind: "unknown".to_string(),
        managed_note: None,
        manual_download_url: MANUAL_DOWNLOAD_URL.to_string(),
    });
}

/// Probe whether we can replace the AppImage in place. We test the *containing
/// directory* for write+execute access (the updater writes a sibling temp file
/// then renames over the original — both need a writable parent dir), and also
/// confirm the file itself isn't read-only. We use a real temp-file create/remove
/// probe rather than trusting mode bits, which lie under root/ACLs/overlayfs.
#[cfg(target_os = "linux")]
fn appimage_writable(appimage: &str) -> bool {
    let path = std::path::Path::new(appimage);
    let Some(dir) = path.parent() else {
        return false;
    };
    // Probe the directory by creating a uniquely-named temp file next to the
    // AppImage and removing it. If that succeeds, an atomic rename-into-place
    // will also succeed.
    let probe = dir.join(format!(".hanzo-update-probe-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            // Also ensure the existing AppImage file is writable (rename needs
            // to overwrite it). read-only file in a writable dir can still be
            // replaced via rename, but be conservative and check both.
            std::fs::metadata(path)
                .map(|m| !m.permissions().readonly())
                .unwrap_or(false)
        }
        Err(_) => false,
    }
}
