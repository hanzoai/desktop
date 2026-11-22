// SPDX-License-Identifier: Apache-2.0
//! Tauri commands binding the Phase 1 mining manager: the Settings switch, and
//! nothing else (capabilities_test.rs holds it to that).

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
