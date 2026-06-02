//! Shared AI-chain mining surface (canonical Hanzo core).
//!
//! Thin Tauri wrapper around the published `hanzo-mining` crate so Hanzo, Zoo
//! and Lux all mine off the *same* network protocol with only their
//! `NetworkType` differing (Hanzo -> HAI, Zoo -> ZOO, ...). No brand strings here.

use std::sync::Arc;

use hanzo_mining::{MiningConfig, MiningManager, MiningStats, NetworkType};
use serde::Serialize;
use tauri::State;

/// Shared Tauri state: the canonical mining manager for this app.
pub type MiningManagerState = Arc<MiningManager>;

/// Construct the mining manager for a given network/brand. Benchmark and
/// auto-start are disabled so the app launches quietly; the UI drives mining via
/// `mining_start` / `mining_stop`.
pub fn new_mining_manager(network: NetworkType) -> MiningManagerState {
    let config = MiningConfig {
        network,
        auto_start: false,
        benchmark_on_start: false,
        ..MiningConfig::default()
    };
    Arc::new(MiningManager::new(config))
}

/// Network descriptor surfaced to the frontend (token symbol, chain id, rpc).
#[derive(Debug, Clone, Serialize)]
pub struct NetworkInfo {
    pub network: String,
    pub native_token: String,
    pub chain_id: u64,
    pub rpc_endpoint: String,
}

#[tauri::command]
pub async fn mining_get_stats(
    manager: State<'_, MiningManagerState>,
) -> Result<MiningStats, String> {
    Ok(manager.get_stats().await)
}

#[tauri::command]
pub async fn mining_start(manager: State<'_, MiningManagerState>) -> Result<(), String> {
    manager.start_mining().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mining_stop(manager: State<'_, MiningManagerState>) -> Result<(), String> {
    manager.stop_mining().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mining_network_info(
    manager: State<'_, MiningManagerState>,
) -> Result<NetworkInfo, String> {
    let net = manager.get_stats().await.network;
    Ok(NetworkInfo {
        network: format!("{:?}", net),
        native_token: net.native_token().to_string(),
        chain_id: net.chain_id(),
        rpc_endpoint: net.rpc_endpoint(),
    })
}
