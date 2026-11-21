// SPDX-License-Identifier: Apache-2.0
//! Tauri commands binding the Phase 1 mining manager: the Settings switch, and
//! nothing else. Both are granted to the window's own pages only
//! (capabilities/main-local.json), never to a remote origin.

use crate::mining::MiningManager;
use std::sync::Arc;
use tauri::{AppHandle, State};

pub type MiningManagerState = Arc<MiningManager>;

/// Whether the person turned on "Earn rewards by sharing this computer's power".
#[tauri::command]
pub fn mining_get_enabled(mining_manager: State<'_, MiningManagerState>) -> bool {
    mining_manager.is_enabled()
}

/// The Settings switch: remembers the choice, and starts or stops mining with it.
#[tauri::command]
pub async fn mining_set_enabled(
    app: AppHandle,
    on: bool,
    mining_manager: State<'_, MiningManagerState>,
) -> Result<(), String> {
    mining_manager.set_enabled(on).map_err(|e| format!("saving the choice: {e}"))?;
    if on {
        let wallet = mining_manager.ensure_dev_wallet();
        mining_manager.start_mining(app, wallet, 96369).await;
    } else {
        mining_manager.stop_mining().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    /// No remote origin (a hanzo.ai page in the main window) reaches any mining command:
    /// mining uses this computer's power, so only the window's own Settings may touch it.
    #[test]
    fn no_remote_page_reaches_a_mining_command() {
        use std::collections::BTreeMap;
        use tauri::utils::acl::{capability::Capability, manifest::Manifest, resolved::Resolved, ExecutionContext};
        let acl: BTreeMap<String, Manifest> =
            serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/acl-manifests.json"))).unwrap();
        let caps: BTreeMap<String, Capability> =
            serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/capabilities.json"))).unwrap();
        let resolved = Resolved::resolve(&acl, caps, tauri::utils::platform::Target::current()).unwrap();
        let mining: Vec<_> = resolved.allowed_commands.iter().filter(|(cmd, _)| cmd.starts_with("mining_")).collect();
        let names: Vec<_> = mining.iter().map(|(cmd, _)| cmd.as_str()).collect();
        assert_eq!(names, ["mining_get_enabled", "mining_set_enabled"], "the switch is the one way");
        for (cmd, grants) in mining {
            assert!(grants.iter().all(|c| c.context == ExecutionContext::Local), "{cmd}: a remote page");
        }
    }
}
