use std::path::PathBuf;

/// Resolve `~/.hanzo/run/machined.sock`. The path is not validated here — the
/// client surfaces a connect error if the daemon is not running.
pub fn machined_socket_path() -> PathBuf {
    if let Some(over) = std::env::var_os("HANZO_MACHINED_SOCKET") {
        return PathBuf::from(over);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".hanzo").join("run").join("machined.sock")
}
