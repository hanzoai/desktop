//! What the built ACL lets a page reach: `capabilities/main.json`, resolved as Tauri
//! resolves it at run time.

use std::collections::BTreeMap;
use tauri::utils::acl::{capability::Capability, manifest::Manifest, resolved::Resolved, ExecutionContext};

fn resolved() -> Resolved {
    let acl: BTreeMap<String, Manifest> =
        serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/acl-manifests.json"))).unwrap();
    let caps: BTreeMap<String, Capability> =
        serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/capabilities.json"))).unwrap();
    Resolved::resolve(&acl, caps, tauri::utils::platform::Target::current()).unwrap()
}

/// A page from another origin (a hanzo.ai frame in the window) reaches no command
/// and no plugin at all, and the window's own pages reach the ones that hold the
/// person's sign-in, their computer's power and disk, and what leaves it.
#[test]
fn no_remote_origin_reaches_anything_and_the_window_reaches_its_own() {
    let resolved = resolved();
    for (cmd, grants) in &resolved.allowed_commands {
        assert!(grants.iter().all(|c| c.context == ExecutionContext::Local), "{cmd}: a remote page reaches it");
    }
    let main = |c: &tauri::utils::acl::resolved::ResolvedCommand| c.windows.iter().any(|w| w.matches("main"));
    for cmd in [
        "identity_adopt",
        "identity_file",
        "iam_loopback",
        "report_redact",
        "mining_get_enabled",
        "mining_set_enabled",
        "local_models_status",
        "local_models_pull",
        "local_models_cancel",
        "local_models_remove",
        "local_models_serve",
        "local_models_stop",
    ] {
        let grants = resolved.allowed_commands.get(cmd).unwrap_or_else(|| panic!("{cmd} is not granted"));
        assert!(grants.iter().any(|c| main(c) && c.context == ExecutionContext::Local), "{cmd}: the window's own page");
    }
    let mining: Vec<_> = resolved.allowed_commands.keys().filter(|c| c.starts_with("mining_")).collect();
    assert_eq!(mining, ["mining_get_enabled", "mining_set_enabled"], "the switch is the one way to mining");
}
