// SPDX-License-Identifier: Apache-2.0
//! Tauri commands binding the Phase 1 mining manager.

use crate::mining::proof::PrivacyLevel;
use crate::mining::{MiningManager, MiningState, ProofRecord};
use std::sync::Arc;
use tauri::{AppHandle, State};

pub type MiningManagerState = Arc<MiningManager>;

#[tauri::command]
pub async fn mining_get_state(
    mining_manager: State<'_, MiningManagerState>,
) -> Result<MiningState, String> {
    Ok(mining_manager.get_state().await)
}

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

#[tauri::command]
pub async fn mining_start(
    app: AppHandle,
    wallet_address: String,
    chain_id: Option<u64>,
    mining_manager: State<'_, MiningManagerState>,
) -> Result<(), String> {
    // No page starts mining the person has not turned on (main.json reaches remote pages).
    if !mining_manager.is_enabled() {
        return Err("mining is off: turn it on in Settings > Advanced".into());
    }
    // Default to Lux mainnet chain id when the frontend hasn't propagated
    // the active brand yet — the precompile is brand-agnostic.
    let chain = chain_id.unwrap_or(96369);
    mining_manager
        .start_mining(app, wallet_address, chain)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn mining_stop(mining_manager: State<'_, MiningManagerState>) -> Result<(), String> {
    mining_manager.stop_mining().await;
    Ok(())
}

#[tauri::command]
pub async fn mining_get_balance(
    mining_manager: State<'_, MiningManagerState>,
) -> Result<String, String> {
    Ok(mining_manager.get_local_pending_wei().await)
}

#[tauri::command]
pub async fn mining_get_wallet_address(
    mining_manager: State<'_, MiningManagerState>,
) -> Result<String, String> {
    Ok(mining_manager.get_wallet_address().await)
}

#[tauri::command]
pub async fn mining_get_history(
    mining_manager: State<'_, MiningManagerState>,
) -> Result<Vec<ProofRecord>, String> {
    Ok(mining_manager.get_history().await)
}

#[tauri::command]
pub async fn mining_get_local_pending(
    mining_manager: State<'_, MiningManagerState>,
) -> Result<String, String> {
    Ok(mining_manager.get_local_pending_wei().await)
}

#[tauri::command]
pub async fn mining_set_privacy(
    privacy: PrivacyLevel,
    mining_manager: State<'_, MiningManagerState>,
) -> Result<(), String> {
    mining_manager.set_privacy(privacy).await;
    Ok(())
}
