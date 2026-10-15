//! Every command in `invoke_handler` is a permission (`allow-<command>`, the
//! name in kebab-case: `hanzo_node_spawn` is `allow-hanzo-node-spawn`), so a
//! window reaches only the commands its capability grants. Without an app
//! manifest, Tauri v2 lets every window call every registered command.
//!
//! The list is read from `generate_handler![...]` in src/main.rs, the one place
//! it is written. The build refuses a `main` capability that does not grant all
//! of them, and any capability that names a command no handler serves.

use std::collections::BTreeSet;

/// The command names inside `generate_handler![...]`, attributes and comments
/// stripped, paths reduced to their last segment.
fn handlers(src: &str) -> Vec<String> {
    let start = src
        .find("generate_handler![")
        .expect("src/main.rs has no generate_handler![")
        + "generate_handler![".len();
    let mut depth = 1;
    let mut end = start;
    for (i, c) in src[start..].char_indices() {
        match c {
            '[' => depth += 1,
            ']' => depth -= 1,
            _ => {}
        }
        if depth == 0 {
            end = start + i;
            break;
        }
    }
    let body: String = src[start..end]
        .lines()
        .map(|l| l.split("//").next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n");
    let mut names = BTreeSet::new();
    let mut rest = body.as_str();
    while let Some(i) = rest.find("#[") {
        let close = rest[i..].find(']').map(|j| i + j + 1).unwrap_or(rest.len());
        names.extend(idents(&rest[..i]));
        rest = &rest[close..];
    }
    names.extend(idents(rest));
    names.into_iter().collect()
}

fn idents(s: &str) -> Vec<String> {
    s.split(',')
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .map(|t| t.rsplit("::").next().unwrap_or(t).to_string())
        .collect()
}

/// The un-prefixed `"allow-<command>"` entries a capability file grants.
fn granted(json: &str) -> BTreeSet<String> {
    json.split("\"allow-")
        .skip(1)
        .filter_map(|s| s.split('"').next())
        .map(str::to_string)
        .collect()
}

fn check(commands: &[String]) {
    let known: BTreeSet<String> = commands.iter().map(|c| c.replace('_', "-")).collect();
    for entry in std::fs::read_dir("capabilities").expect("capabilities/") {
        let path = entry.expect("capability entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let json = std::fs::read_to_string(&path).expect("read capability");
        let grants = granted(&json);
        let unknown: Vec<_> = grants.iter().filter(|g| !known.contains(*g)).collect();
        assert!(
            unknown.is_empty(),
            "{} grants commands no handler serves: {unknown:?}",
            path.display()
        );
        if path.file_stem().and_then(|s| s.to_str()) == Some("main") {
            let missing: Vec<_> = known.iter().filter(|c| !grants.contains(*c)).collect();
            assert!(
                missing.is_empty(),
                "capabilities/main.json must grant every command the app registers; add allow-<name> for {missing:?}"
            );
        }
    }
}

fn main() {
    // fix for crashing bundle dmg/app on MACOS
    println!("cargo:rustc-env=MACOSX_DEPLOYMENT_TARGET=10.13");
    println!("cargo:rerun-if-changed=src/main.rs");
    println!("cargo:rerun-if-changed=capabilities");

    let src = std::fs::read_to_string("src/main.rs").expect("src/main.rs");
    let commands = handlers(&src);
    check(&commands);
    let names: Vec<&'static str> = commands
        .into_iter()
        .map(|c| &*Box::leak(c.into_boxed_str()))
        .collect();
    let names: &'static [&'static str] = Box::leak(names.into_boxed_slice());

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(names)),
    )
    .expect("tauri build");
}
