//! Hanzo Dev on this computer: the coding agent a run in a folder works with.
//!
//! A local run is `dev exec` in the person's folder. Most people have no `dev`
//! and no terminal to install one in, so the desktop finds it ([`resolve`]) or
//! fetches the pinned release once ([`VERSION`], [`asset`]), checks it against
//! the checksum published beside it ([`verify`]) and unpacks the one binary it
//! holds ([`unpack`]). Everything here is a pure function of its arguments
//! (paths, names, bytes); the download itself, its progress and the run are the
//! app's (`src/commands/local_workspace.rs`).

use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// The release fetched when the computer has no `dev`. The one place the version is written.
pub const VERSION: &str = "0.7.23";

/// Environment variable naming the agent explicitly.
pub const OVERRIDE_VAR: &str = "HANZO_DEV_BIN";

/// Hanzo Dev's releases: the terminal agent lives at hanzoai/dev-v1 (hanzoai/dev is the app).
const RELEASES: &str = "https://github.com/hanzoai/dev-v1/releases/download";

/// The agent's file name on this platform.
pub const fn file_name() -> &'static str {
    if cfg!(windows) {
        "dev.exe"
    } else {
        "dev"
    }
}

/// How a release file packs the binary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    TarGz,
    Zip,
}

/// One file of the release: its name there, and how it is packed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Asset {
    pub name: &'static str,
    pub kind: Kind,
}

impl Asset {
    /// Where the file is published.
    pub fn url(&self) -> String {
        format!("{RELEASES}/v{VERSION}/{}", self.name)
    }

    /// Where its checksum is published: `<name>.sha256`, beside it.
    pub fn digest_url(&self) -> String {
        format!("{}.sha256", self.url())
    }
}

/// The release file for an operating system and CPU (Rust's `std::env::consts`
/// names), or `None` where Hanzo Dev publishes none.
pub fn asset(os: &str, arch: &str) -> Option<Asset> {
    let (name, kind) = match (os, arch) {
        ("macos", "aarch64") => ("dev-aarch64-apple-darwin.tar.gz", Kind::TarGz),
        ("macos", "x86_64") => ("dev-x86_64-apple-darwin.tar.gz", Kind::TarGz),
        ("linux", "x86_64") => ("dev-x86_64-unknown-linux-musl.tar.gz", Kind::TarGz),
        ("linux", "aarch64") => ("dev-aarch64-unknown-linux-musl.tar.gz", Kind::TarGz),
        ("windows", "x86_64") => ("dev-x86_64-pc-windows-msvc.exe.zip", Kind::Zip),
        _ => return None,
    };
    Some(Asset { name, kind })
}

/// The release file for this computer.
pub fn here() -> Option<Asset> {
    asset(std::env::consts::OS, std::env::consts::ARCH)
}

/// Where the app keeps its own copy under `data_dir`: one folder per version, so a
/// newer pin is fetched beside the old one and the old one can be let go.
pub fn own(data_dir: &Path) -> PathBuf {
    data_dir.join("dev").join(VERSION).join(file_name())
}

/// The agent to run, or `None` when the computer has none and the release must be fetched.
///
/// In this order: [`OVERRIDE_VAR`] when set and not empty (the person's explicit choice, returned as
/// written so a bad value surfaces as a real error), `dev` in `~/.local/bin`, in `~/.cargo/bin`, on
/// `PATH`, then the app's own copy (`own_copy`). The values are parameters, not read here, so the
/// lookup is testable.
pub fn resolve(
    override_bin: Option<&OsStr>,
    home: Option<&Path>,
    own_copy: &Path,
    path_var: Option<&OsStr>,
) -> Option<PathBuf> {
    if let Some(bin) = override_bin.filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(bin));
    }
    let homes = home
        .into_iter()
        .flat_map(|h| [h.join(".local/bin"), h.join(".cargo/bin")]);
    let paths = path_var
        .into_iter()
        .flat_map(std::env::split_paths)
        .filter(|dir| !dir.as_os_str().is_empty());
    homes
        .chain(paths)
        .map(|dir| dir.join(file_name()))
        .chain(std::iter::once(own_copy.to_path_buf()))
        .find(|candidate| is_executable_file(candidate))
}

/// A regular file the current user could execute (on Unix, any execute bit).
fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else {
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

/// The digest in a published `.sha256` file (`<hex>  <name>`), lowercase, or `None` when the file is not one.
pub fn expected(sha256_file: &str) -> Option<String> {
    let word = sha256_file.split_whitespace().next()?;
    (word.len() == 64 && word.bytes().all(|b| b.is_ascii_hexdigit())).then(|| word.to_ascii_lowercase())
}

/// The SHA-256 of a file, as lowercase hex.
pub fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Whether the file at `path` is the one `expected_hex` names.
pub fn verify(path: &Path, expected_hex: &str) -> io::Result<bool> {
    Ok(sha256_file(path)?.eq_ignore_ascii_case(expected_hex))
}

/// Writes the one binary a release file holds to `dest`, and makes it executable. The archive's own
/// names and paths are never used, so nothing in it can write anywhere but `dest`.
pub fn unpack(archive: &Path, kind: Kind, dest: &Path) -> io::Result<()> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir)?;
    }
    let part = dest.with_extension("part");
    let written = match kind {
        Kind::TarGz => first_in_tar(archive, &part),
        Kind::Zip => first_in_zip(archive, &part),
    };
    if let Err(e) = written {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&part, fs::Permissions::from_mode(0o755))?;
    }
    fs::rename(&part, dest)
}

fn nothing() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "the download holds no program")
}

fn first_in_tar(archive: &Path, out: &Path) -> io::Result<()> {
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(File::open(archive)?));
    for entry in tar.entries()? {
        let mut entry = entry?;
        if entry.header().entry_type().is_file() {
            io::copy(&mut entry, &mut File::create(out)?)?;
            return Ok(());
        }
    }
    Err(nothing())
}

fn first_in_zip(archive: &Path, out: &Path) -> io::Result<()> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?).map_err(io::Error::other)?;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(io::Error::other)?;
        if file.is_file() {
            let mut dest = File::create(out)?;
            io::copy(&mut file, &mut dest)?;
            dest.flush()?;
            return Ok(());
        }
    }
    Err(nothing())
}

/// What a finished `dev exec` gives back: the answer, and how it got there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    /// The agent's final message: what a person reads.
    pub output: String,
    /// What it did on the way: its log (stderr), and what it printed when that is not the answer.
    pub process: String,
}

/// Splits a run into its answer and its process. `last` is what `--output-last-message` wrote, and is the
/// answer when it holds one; otherwise the answer is what the agent printed (stdout), which is that same
/// message when the file could not be written. The process is the agent's log, and holds stdout only when
/// stdout is not what was shown as the answer.
pub fn outcome(last: Option<&str>, stdout: &str, stderr: &str) -> Outcome {
    let last = last.map(str::trim).filter(|s| !s.is_empty());
    let printed = stdout.trim();
    let output = last.unwrap_or(printed).to_string();
    let mut process = stderr.trim().to_string();
    if !printed.is_empty() && printed != output {
        if !process.is_empty() {
            process.push('\n');
        }
        process.push_str(printed);
    }
    Outcome { output, process }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn executable(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    #[test]
    fn names_the_release_file_for_every_computer_it_publishes_for() {
        let a = asset("macos", "aarch64").unwrap();
        assert_eq!(a.name, "dev-aarch64-apple-darwin.tar.gz");
        assert_eq!(a.kind, Kind::TarGz);
        assert_eq!(asset("macos", "x86_64").unwrap().name, "dev-x86_64-apple-darwin.tar.gz");
        assert_eq!(asset("linux", "x86_64").unwrap().name, "dev-x86_64-unknown-linux-musl.tar.gz");
        assert_eq!(asset("linux", "aarch64").unwrap().name, "dev-aarch64-unknown-linux-musl.tar.gz");
        let w = asset("windows", "x86_64").unwrap();
        assert_eq!(w.name, "dev-x86_64-pc-windows-msvc.exe.zip");
        assert_eq!(w.kind, Kind::Zip);
        assert_eq!(asset("windows", "aarch64"), None);
        assert_eq!(asset("freebsd", "x86_64"), None);
    }

    #[test]
    fn the_release_and_its_checksum_sit_beside_each_other() {
        let a = asset("linux", "x86_64").unwrap();
        assert_eq!(
            a.url(),
            format!("https://github.com/hanzoai/dev-v1/releases/download/v{VERSION}/dev-x86_64-unknown-linux-musl.tar.gz")
        );
        assert_eq!(a.digest_url(), format!("{}.sha256", a.url()));
    }

    #[test]
    fn reads_a_published_checksum() {
        let hex = "07a7d7fb02a406d6aafd96eac7c3a9f37250210378241b896401ec1fdaa8a83b";
        assert_eq!(expected(&format!("{hex}  dev-x86_64-unknown-linux-musl.tar.gz\n")).as_deref(), Some(hex));
        assert_eq!(expected(&hex.to_uppercase()).as_deref(), Some(hex));
        assert_eq!(expected("<html>Not Found</html>"), None);
        assert_eq!(expected("abc123  file"), None);
        assert_eq!(expected(""), None);
    }

    #[test]
    fn a_file_matches_its_digest_and_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("f");
        fs::write(&file, b"hello").unwrap();
        let hello = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert_eq!(sha256_file(&file).unwrap(), hello);
        assert!(verify(&file, hello).unwrap());
        assert!(verify(&file, &hello.to_uppercase()).unwrap());
        assert!(!verify(&file, &"0".repeat(64)).unwrap());
        assert!(verify(&dir.path().join("missing"), hello).is_err());
    }

    #[test]
    fn an_explicit_choice_is_returned_as_written() {
        let own_copy = Path::new("/nowhere/dev");
        let chosen = OsString::from("/opt/dev");
        assert_eq!(resolve(Some(chosen.as_os_str()), None, own_copy, None), Some(PathBuf::from("/opt/dev")));
        let empty = OsString::new();
        assert_eq!(resolve(Some(empty.as_os_str()), None, own_copy, None), None);
    }

    #[test]
    fn finds_dev_in_the_homes_bins_then_on_the_path_then_the_apps_own_copy() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        let on_path = dir.path().join("bin");
        let own_copy = dir.path().join("data").join("dev").join(VERSION).join(file_name());
        let path_var = std::env::join_paths([&on_path]).unwrap();
        assert_eq!(resolve(None, Some(&home), &own_copy, Some(&path_var)), None);

        executable(&own_copy);
        assert_eq!(resolve(None, Some(&home), &own_copy, Some(&path_var)), Some(own_copy.clone()));

        executable(&on_path.join(file_name()));
        assert_eq!(resolve(None, Some(&home), &own_copy, Some(&path_var)), Some(on_path.join(file_name())));

        executable(&home.join(".cargo/bin").join(file_name()));
        assert_eq!(resolve(None, Some(&home), &own_copy, Some(&path_var)), Some(home.join(".cargo/bin").join(file_name())));

        executable(&home.join(".local/bin").join(file_name()));
        assert_eq!(resolve(None, Some(&home), &own_copy, Some(&path_var)), Some(home.join(".local/bin").join(file_name())));
    }

    #[cfg(unix)]
    #[test]
    fn a_file_that_cannot_run_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let plain = home.join(".local/bin").join(file_name());
        fs::create_dir_all(plain.parent().unwrap()).unwrap();
        fs::write(&plain, b"x").unwrap();
        assert_eq!(resolve(None, Some(home), &dir.path().join("none"), None), None);
    }

    fn tar_gz(path: &Path, members: &[(&str, &[u8])]) {
        let file = File::create(path).unwrap();
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(file, flate2::Compression::fast()));
        for (name, body) in members {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder.append_data(&mut header, name, *body).unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap();
    }

    #[test]
    fn unpacks_the_one_binary_whatever_it_is_called_and_makes_it_run() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("dev.tar.gz");
        tar_gz(&archive, &[("elsewhere/inside/dev-x86_64-unknown-linux-musl", b"binary".as_slice())]);
        let dest = dir.path().join("data/dev/1/dev");
        unpack(&archive, Kind::TarGz, &dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"binary");
        assert!(!dir.path().join("elsewhere").exists());
        assert!(!dest.with_extension("part").exists());
        assert!(is_executable_file(&dest));
    }

    #[test]
    fn unpacks_a_zip() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("dev.zip");
        {
            let mut zip = zip::ZipWriter::new(File::create(&archive).unwrap());
            zip.start_file("dev-x86_64-pc-windows-msvc.exe", zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(b"exe").unwrap();
            zip.finish().unwrap();
        }
        let dest = dir.path().join("dev.exe");
        unpack(&archive, Kind::Zip, &dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"exe");
    }

    #[test]
    fn an_archive_with_no_file_in_it_or_that_is_not_one_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let empty = dir.path().join("empty.tar.gz");
        tar_gz(&empty, &[]);
        let dest = dir.path().join("out/dev");
        assert_eq!(unpack(&empty, Kind::TarGz, &dest).unwrap_err().kind(), io::ErrorKind::InvalidData);
        assert!(!dest.exists() && !dest.with_extension("part").exists());
        let junk = dir.path().join("junk");
        fs::write(&junk, b"not an archive").unwrap();
        assert!(unpack(&junk, Kind::TarGz, &dest).is_err());
        assert!(unpack(&junk, Kind::Zip, &dest).is_err());
        assert!(!dest.exists() && !dest.with_extension("part").exists());
    }

    #[test]
    fn the_answer_is_the_last_message_and_the_process_is_the_log() {
        let o = outcome(Some("I added the page.\n"), "I added the page.\n", "workdir: /x\nexec ls\n");
        assert_eq!(o.output, "I added the page.");
        assert_eq!(o.process, "workdir: /x\nexec ls");
    }

    #[test]
    fn without_the_file_the_answer_is_what_was_printed() {
        let o = outcome(None, "Done.\n", "log\n");
        assert_eq!(o, Outcome { output: "Done.".into(), process: "log".into() });
        let blank = outcome(Some("  \n"), "Done.", "");
        assert_eq!(blank, Outcome { output: "Done.".into(), process: String::new() });
    }

    #[test]
    fn what_was_printed_beside_a_different_answer_stays_in_the_process() {
        let o = outcome(Some("Final."), "Progress text", "log");
        assert_eq!(o.output, "Final.");
        assert_eq!(o.process, "log\nProgress text");
    }

    #[test]
    fn a_run_that_said_nothing_has_no_answer() {
        assert_eq!(outcome(None, "", "boom"), Outcome { output: String::new(), process: "boom".into() });
    }
}
