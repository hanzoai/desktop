//! Fixtures are synthetic; no real key material is stored in the repo.
use hanzo_node_secret::{rotate_localhost_cert_once, Rotation, ROTATION_ID, ROTATION_MARKER, SECRET_FILE};
use std::fs;
use std::path::Path;

const IDENTITY: &str = "1111111111111111111111111111111111111111111111111111111111111111";
const ENCRYPTION: &str = "2222222222222222222222222222222222222222222222222222222222222222";
const OLD_KEY: &str = "-----BEGIN PRIVATE KEY-----\\nT0xES0VZT0xES0VZT0xES0VZ\\n-----END PRIVATE KEY-----";
const OLD_CERT: &str = "-----BEGIN CERTIFICATE-----\\nT0xEQ0VSVE9MRENFUlQ=\\n-----END CERTIFICATE-----";

fn secret(key: &str, cert: &str) -> String {
    // The layout hanzo-node writes: five KEY=VALUE lines, PEMs with literal \n.
    format!(
        "GLOBAL_IDENTITY_NAME=@@localhost.sep-hanzo\nIDENTITY_SECRET_KEY={IDENTITY}\nENCRYPTION_SECRET_KEY={ENCRYPTION}\nPRIVATE_HTTPS_CERTIFICATE={key}\nPUBLIC_HTTPS_CERTIFICATE={cert}"
    )
}

fn field<'a>(text: &'a str, name: &str) -> &'a str {
    text.lines()
        .find_map(|l| l.strip_prefix(&format!("{name}=")))
        .unwrap_or_else(|| panic!("{name} missing"))
}

fn storage_with(content: &str) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(SECRET_FILE), content).unwrap();
    dir
}

#[test]
fn rotates_only_the_https_certificate_and_key() {
    let dir = storage_with(&secret(OLD_KEY, OLD_CERT));
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::Rotated);
    let after = fs::read_to_string(dir.path().join(SECRET_FILE)).unwrap();

    assert_eq!(field(&after, "GLOBAL_IDENTITY_NAME"), "@@localhost.sep-hanzo");
    assert_eq!(field(&after, "IDENTITY_SECRET_KEY"), IDENTITY);
    assert_eq!(field(&after, "ENCRYPTION_SECRET_KEY"), ENCRYPTION);
    assert_eq!(after.lines().count(), 5, "one line per field, PEMs stay escaped");

    let key = field(&after, "PRIVATE_HTTPS_CERTIFICATE");
    let cert = field(&after, "PUBLIC_HTTPS_CERTIFICATE");
    assert_ne!(key, OLD_KEY);
    assert_ne!(cert, OLD_CERT);
    assert!(key.starts_with("-----BEGIN PRIVATE KEY-----\\n"), "PKCS#8, as the node parses it");
    assert!(cert.starts_with("-----BEGIN CERTIFICATE-----\\n"));
    // What the node does on read: unescape, then parse.
    rcgen::KeyPair::from_pem(&key.replace("\\n", "\n")).expect("new key parses");
}

#[test]
fn each_install_gets_its_own_key() {
    let a = storage_with(&secret(OLD_KEY, OLD_CERT));
    let b = storage_with(&secret(OLD_KEY, OLD_CERT));
    rotate_localhost_cert_once(a.path()).unwrap();
    rotate_localhost_cert_once(b.path()).unwrap();
    let ka = fs::read_to_string(a.path().join(SECRET_FILE)).unwrap();
    let kb = fs::read_to_string(b.path().join(SECRET_FILE)).unwrap();
    assert_ne!(field(&ka, "PRIVATE_HTTPS_CERTIFICATE"), field(&kb, "PRIVATE_HTTPS_CERTIFICATE"));
}

#[cfg(unix)]
#[test]
fn secret_file_is_owner_only_after_rotation() {
    use std::os::unix::fs::PermissionsExt;
    let dir = storage_with(&secret(OLD_KEY, OLD_CERT));
    fs::set_permissions(dir.path().join(SECRET_FILE), fs::Permissions::from_mode(0o644)).unwrap();
    rotate_localhost_cert_once(dir.path()).unwrap();
    let mode = fs::metadata(dir.path().join(SECRET_FILE)).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

#[cfg(unix)]
#[test]
fn secret_file_is_tightened_even_when_already_rotated() {
    use std::os::unix::fs::PermissionsExt;
    let dir = storage_with(&secret(OLD_KEY, OLD_CERT));
    rotate_localhost_cert_once(dir.path()).unwrap();
    // The node rewrites .secret on every start; an older node recreating it
    // with the default umask must not leave it readable.
    fs::set_permissions(dir.path().join(SECRET_FILE), fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::AlreadyDone);
    let mode = fs::metadata(dir.path().join(SECRET_FILE)).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

#[test]
fn runs_once() {
    let dir = storage_with(&secret(OLD_KEY, OLD_CERT));
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::Rotated);
    let first = fs::read_to_string(dir.path().join(SECRET_FILE)).unwrap();
    assert_eq!(fs::read_to_string(dir.path().join(ROTATION_MARKER)).unwrap().trim(), ROTATION_ID);
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::AlreadyDone);
    assert_eq!(fs::read_to_string(dir.path().join(SECRET_FILE)).unwrap(), first);
}

#[test]
fn an_older_marker_rotates_again() {
    let dir = storage_with(&secret(OLD_KEY, OLD_CERT));
    fs::write(dir.path().join(ROTATION_MARKER), "some-earlier-rotation\n").unwrap();
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::Rotated);
}

#[test]
fn fresh_install_has_nothing_to_rotate() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::NotNeeded);
    assert!(!dir.path().join(SECRET_FILE).exists(), "the node creates .secret itself");
    assert!(dir.path().join(ROTATION_MARKER).exists());
}

#[test]
fn https_disabled_is_left_disabled() {
    let original = secret("", "");
    let dir = storage_with(&original);
    assert_eq!(rotate_localhost_cert_once(dir.path()).unwrap(), Rotation::NotNeeded);
    assert_eq!(fs::read_to_string(dir.path().join(SECRET_FILE)).unwrap(), original);
}

#[test]
fn missing_storage_dir_is_not_an_error() {
    let dir = tempfile::tempdir().unwrap();
    let gone = dir.path().join("does-not-exist");
    assert_eq!(rotate_localhost_cert_once(Path::new(&gone)).unwrap(), Rotation::NotNeeded);
}
