use hanzo_engine_bin::{file_name, resolve};
use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

/// A fresh empty directory under the system temp dir, removed on drop.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "hanzo-engine-bin-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        Scratch(dir)
    }

    fn dir(&self, name: &str) -> PathBuf {
        let d = self.0.join(name);
        fs::create_dir_all(&d).unwrap();
        d
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn put_engine(dir: &Path, executable: bool) -> PathBuf {
    let bin = dir.join(file_name());
    fs::write(&bin, b"#!/bin/sh\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = if executable { 0o755 } else { 0o644 };
        fs::set_permissions(&bin, fs::Permissions::from_mode(mode)).unwrap();
    }
    #[cfg(not(unix))]
    let _ = executable;
    bin
}

fn path_of(dirs: &[&Path]) -> OsString {
    std::env::join_paths(dirs).unwrap()
}

#[test]
fn nothing_installed_is_none() {
    let s = Scratch::new();
    let exe = s.dir("app");
    let a = s.dir("a");
    let b = s.dir("b");
    let path = path_of(&[&a, &b]);
    assert_eq!(resolve(None, Some(&exe), Some(&path)), None);
    assert_eq!(resolve(None, None, None), None);
}

#[test]
fn the_override_wins_and_is_taken_as_written() {
    let s = Scratch::new();
    let exe = s.dir("app");
    put_engine(&exe, true);
    let missing = s.0.join("not-there").join("hanzo-server");
    assert_eq!(
        resolve(Some(missing.as_os_str()), Some(&exe), None),
        Some(missing.clone()),
        "an explicit HANZO_ENGINE_BIN is the user's choice; a bad one must fail loudly at spawn"
    );
    assert_eq!(
        resolve(Some(OsStr::new("my-engine")), None, None),
        Some(PathBuf::from("my-engine"))
    );
}

#[test]
fn an_empty_override_is_ignored() {
    let s = Scratch::new();
    let exe = s.dir("app");
    let bundled = put_engine(&exe, true);
    assert_eq!(resolve(Some(OsStr::new("")), Some(&exe), None), Some(bundled));
}

#[test]
fn the_bundled_binary_beats_path() {
    let s = Scratch::new();
    let exe = s.dir("app");
    let bundled = put_engine(&exe, true);
    let bin = s.dir("bin");
    put_engine(&bin, true);
    let path = path_of(&[&bin]);
    assert_eq!(resolve(None, Some(&exe), Some(&path)), Some(bundled));
}

#[test]
fn path_is_searched_in_order() {
    let s = Scratch::new();
    let exe = s.dir("app");
    let first = s.dir("first");
    let second = s.dir("second");
    let third = s.dir("third");
    let want = put_engine(&second, true);
    put_engine(&third, true);
    let path = path_of(&[&first, &second, &third]);
    assert_eq!(resolve(None, Some(&exe), Some(&path)), Some(want));
}

#[test]
fn a_directory_with_the_engine_name_is_not_the_engine() {
    let s = Scratch::new();
    let exe = s.dir("app");
    fs::create_dir_all(exe.join(file_name())).unwrap();
    assert_eq!(resolve(None, Some(&exe), None), None);
}

#[cfg(unix)]
#[test]
fn a_file_without_an_execute_bit_is_skipped() {
    let s = Scratch::new();
    let exe = s.dir("app");
    put_engine(&exe, false);
    let bin = s.dir("bin");
    let want = put_engine(&bin, true);
    let path = path_of(&[&bin]);
    assert_eq!(resolve(None, Some(&exe), Some(&path)), Some(want));
}
