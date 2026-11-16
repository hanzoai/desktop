//! Stub: tests are written first (see tests/rotation.rs).
use std::io;
use std::path::Path;

pub const SECRET_FILE: &str = ".secret";
pub const ROTATION_MARKER: &str = ".localhost-tls-rotated";
pub const ROTATION_ID: &str = "cloud-761";

#[derive(Debug, PartialEq, Eq)]
pub enum Rotation {
    Rotated,
    NotNeeded,
    AlreadyDone,
}

pub fn rotate_localhost_cert_once(_node_storage: &Path) -> io::Result<Rotation> {
    Ok(Rotation::AlreadyDone)
}
