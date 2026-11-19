//! Where the local inference engine binary is, if anywhere.
//!
//! The desktop starts `hanzo-server` (hanzoai/engine) on :36900 for chat and
//! :36901 for embeddings when it can. Release bundles do not ship it: the
//! `.app` carries `hanzo-desktop`, `hanzo-node`, `deno` and `uv` and nothing
//! else (`bundle.externalBin` in tauri.conf.json). Before cloud#760 the app
//! spawned the bare name anyway and logged two ERROR lines on every start,
//! "failed to spawn hanzo-engine (hanzo-server): No such file or directory".
//!
//! [`resolve`] answers the question first, in this order:
//!
//! 1. `HANZO_ENGINE_BIN`, when set and not empty. It is the user's explicit
//!    choice, so it is returned as written and a bad value surfaces as a real
//!    spawn error rather than being skipped.
//! 2. `hanzo-server` beside the app executable (a bundle that ships it).
//! 3. `hanzo-server` on `PATH`, as an executable file.
//!
//! `None` means there is no engine to start; the caller skips the local
//! engine and cloud inference is unaffected.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Environment variable naming the engine binary explicitly.
pub const OVERRIDE_VAR: &str = "HANZO_ENGINE_BIN";

/// The engine's file name on this platform.
pub const fn file_name() -> &'static str {
    if cfg!(windows) {
        "hanzo-server.exe"
    } else {
        "hanzo-server"
    }
}

/// The engine binary to spawn, or `None` when none is installed.
///
/// `override_bin` is the value of [`OVERRIDE_VAR`], `exe_dir` the directory
/// holding the running app executable, `path_var` the value of `PATH`. They
/// are parameters, not read here, so the lookup is testable.
pub fn resolve(
    override_bin: Option<&OsStr>,
    exe_dir: Option<&Path>,
    path_var: Option<&OsStr>,
) -> Option<PathBuf> {
    if let Some(bin) = override_bin.filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(bin));
    }
    if let Some(candidate) = exe_dir.map(|dir| dir.join(file_name())) {
        if is_executable_file(&candidate) {
            return Some(candidate);
        }
    }
    path_var.and_then(|paths| {
        std::env::split_paths(paths)
            .filter(|dir| !dir.as_os_str().is_empty())
            .map(|dir| dir.join(file_name()))
            .find(|candidate| is_executable_file(candidate))
    })
}

/// A regular file the current user could execute (on Unix, any execute bit).
fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
