//! Where the local inference engine binary is, if anywhere.
//!
//! The desktop serves a downloaded model with hanzoai/engine on :36900 when
//! the person picks one. Release bundles do not ship the engine: the `.app`
//! carries `hanzo-desktop` and nothing else (tauri.conf.json declares no
//! `externalBin` and no `resources`).
//!
//! The engine's own release (`hanzo-engine-<os>-<arch>.tar.gz`) holds one
//! binary, `hanzo-engine` (package `hanzo-cli`), and the `hanzo` CLI's
//! `engine serve` looks for that name too. `hanzo-server` is the older name of
//! the same server and is still found.
//!
//! [`resolve`] answers the question first, in this order:
//!
//! 1. `HANZO_ENGINE_BIN`, when set and not empty. It is the user's explicit
//!    choice, so it is returned as written and a bad value surfaces as a real
//!    spawn error rather than being skipped.
//! 2. Beside the app executable (a bundle that ships it), each of [`NAMES`].
//! 3. On `PATH`, each of [`NAMES`], as an executable file.
//!
//! `None` means there is no engine to start; the caller skips the local
//! engine and cloud inference is unaffected.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Environment variable naming the engine binary explicitly.
pub const OVERRIDE_VAR: &str = "HANZO_ENGINE_BIN";

/// The engine's file names on this platform, the released name first.
pub const NAMES: [&str; 2] = if cfg!(windows) {
    ["hanzo-engine.exe", "hanzo-server.exe"]
} else {
    ["hanzo-engine", "hanzo-server"]
};

/// The engine's file name on this platform, as its release ships it.
pub const fn file_name() -> &'static str {
    NAMES[0]
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
    if let Some(dir) = exe_dir {
        if let Some(found) = NAMES.iter().map(|n| dir.join(n)).find(|c| is_executable_file(c)) {
            return Some(found);
        }
    }
    path_var.and_then(|paths| {
        std::env::split_paths(paths)
            .filter(|dir| !dir.as_os_str().is_empty())
            .flat_map(|dir| NAMES.map(|n| dir.join(n)))
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
