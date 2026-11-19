//! One-time rotation of the local node's localhost HTTPS certificate.
//!
//! hanzo-node keeps its keys in `<node_storage>/.secret`, one `KEY=VALUE` per
//! line, PEM values with literal `\n` escapes:
//!
//! ```text
//! GLOBAL_IDENTITY_NAME=...
//! IDENTITY_SECRET_KEY=...
//! ENCRYPTION_SECRET_KEY=...
//! PRIVATE_HTTPS_CERTIFICATE=-----BEGIN PRIVATE KEY-----\n...
//! PUBLIC_HTTPS_CERTIFICATE=-----BEGIN CERTIFICATE-----\n...
//! ```
//!
//! Once those two HTTPS values exist the node reuses them forever. Earlier
//! builds wrote that private key to the desktop log, so the fixed build
//! replaces it once: a fresh self-signed `localhost` certificate and PKCS#8
//! key (what the node generates itself), every other line untouched. The
//! node must not be running. A marker file holding [`ROTATION_ID`] makes it
//! run once per id; bump the id to force another rotation. `.secret` is kept
//! owner-only (0600 on Unix) on every call, because older nodes recreate it
//! with the default umask.

use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair};
use std::fs;
use std::io::{self, Write};
use std::path::Path;

pub const SECRET_FILE: &str = ".secret";
pub const ROTATION_MARKER: &str = ".localhost-tls-rotated";
/// Identifies this rotation. Changing it rotates once more on next start.
pub const ROTATION_ID: &str = "cloud-761";

const PRIVATE: &str = "PRIVATE_HTTPS_CERTIFICATE";
const PUBLIC: &str = "PUBLIC_HTTPS_CERTIFICATE";

#[derive(Debug, PartialEq, Eq)]
pub enum Rotation {
    /// A new certificate and key were written.
    Rotated,
    /// No `.secret` yet, or HTTPS not configured: nothing to replace.
    NotNeeded,
    /// This rotation already ran on this install.
    AlreadyDone,
}

pub fn rotate_localhost_cert_once(node_storage: &Path) -> io::Result<Rotation> {
    let secret = node_storage.join(SECRET_FILE);
    let marker = node_storage.join(ROTATION_MARKER);
    if !node_storage.is_dir() {
        return Ok(Rotation::NotNeeded);
    }
    if secret.exists() {
        restrict(&secret)?;
    }
    if fs::read_to_string(&marker).map_or(false, |m| m.trim() == ROTATION_ID) {
        return Ok(Rotation::AlreadyDone);
    }
    let outcome = match fs::read_to_string(&secret) {
        Ok(text) => rotate_text(&text)?
            .map(|new| write_owner_only(&secret, new.as_bytes()).map(|_| Rotation::Rotated))
            .unwrap_or(Ok(Rotation::NotNeeded))?,
        Err(e) if e.kind() == io::ErrorKind::NotFound => Rotation::NotNeeded,
        Err(e) => return Err(e),
    };
    write_owner_only(&marker, format!("{ROTATION_ID}\n").as_bytes())?;
    Ok(outcome)
}

/// Returns the new `.secret` text, or `None` when HTTPS is not configured.
fn rotate_text(text: &str) -> io::Result<Option<String>> {
    let has_https = text.lines().any(|l| {
        l.strip_prefix(PRIVATE)
            .and_then(|r| r.strip_prefix('='))
            .map_or(false, |v| !v.trim().is_empty())
    });
    if !has_https {
        return Ok(None);
    }
    let (key, cert) = generate_localhost()?;
    let (key, cert) = (escape(&key), escape(&cert));
    let mut out = Vec::new();
    let mut wrote_public = false;
    for line in text.lines() {
        if is_field(line, PRIVATE) {
            out.push(format!("{PRIVATE}={key}"));
        } else if is_field(line, PUBLIC) {
            out.push(format!("{PUBLIC}={cert}"));
            wrote_public = true;
        } else {
            out.push(line.to_string());
        }
    }
    if !wrote_public {
        out.push(format!("{PUBLIC}={cert}"));
    }
    let mut s = out.join("\n");
    if text.ends_with('\n') {
        s.push('\n');
    }
    Ok(Some(s))
}

fn is_field(line: &str, name: &str) -> bool {
    line.strip_prefix(name).map_or(false, |r| r.trim_start().starts_with('='))
}

/// Same shape as hanzo-node's own first-run certificate (keys.rs).
fn generate_localhost() -> io::Result<(String, String)> {
    let err = |e: rcgen::Error| io::Error::new(io::ErrorKind::Other, format!("certificate generation failed: {e}"));
    let mut params = CertificateParams::new(vec!["localhost".to_string()]).map_err(err)?;
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "localhost");
    params.distinguished_name = dn;
    let key_pair = KeyPair::generate().map_err(err)?;
    let cert = params.self_signed(&key_pair).map_err(err)?;
    Ok((key_pair.serialize_pem().trim().to_string(), cert.pem()))
}

fn escape(pem: &str) -> String {
    pem.replace("\r\n", "\n").replace('\n', "\\n")
}

/// Write via a sibling temp file created owner-only, then rename over.
fn write_owner_only(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("rotate.tmp");
    {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    restrict(&tmp)?;
    fs::rename(&tmp, path)
}

#[cfg(unix)]
fn restrict(p: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(p, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict(_p: &Path) -> io::Result<()> {
    Ok(())
}
