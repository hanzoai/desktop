// SPDX-License-Identifier: Apache-2.0
//! Phase 1 mining manager. Builds, signs, and locally verifies AI-mining
//! work proofs against the canonical lux precompile via FFI. Persists a
//! proof history to disk so the UI can render local pending balance.
//! On-chain submission is Phase 2 and intentionally out of scope here.

pub mod backend;
pub mod claim;
pub mod error;
pub mod precompile;
pub mod proof;

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};

use backend::{CpuBackend, MiningBackend};
use error::MiningError;
use proof::{MlDsa65SigningKey, PrivacyLevel};

const HISTORY_CAP: usize = 1000;
const TICK_SECS: u64 = 60;

/// Single proof record persisted in history.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRecord {
    pub work_id_hex: String,
    pub reward_wei: String, // decimal string to keep precision in JS
    pub chain_id: u64,
    pub status: String, // "locally_verified" | "pending_claim"
    pub timestamp: u64,
    pub privacy: u16,
    pub compute_minutes: u32,
    pub backend: String,
}

/// Snapshot the UI binds to. Replaces the legacy float-balance model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiningState {
    pub wallet_address: String,
    pub is_mining: bool,
    pub backend: String,
    pub privacy: PrivacyLevel,
    pub last_updated: u64,
    pub local_pending_wei: String, // sum of unclaimed rewards (decimal)
    pub last_claimed_wei: String,
    pub history_count: usize,
}

impl Default for MiningState {
    fn default() -> Self {
        Self {
            wallet_address: String::new(),
            is_mining: false,
            backend: "CPU".to_string(),
            privacy: PrivacyLevel::Public,
            last_updated: 0,
            local_pending_wei: "0".to_string(),
            last_claimed_wei: "0".to_string(),
            history_count: 0,
        }
    }
}

pub struct MiningManager {
    state: Arc<RwLock<MiningState>>,
    storage_dir: PathBuf,
    backend: Arc<dyn MiningBackend>,
    signing_key: Arc<RwLock<MlDsa65SigningKey>>,
}

impl MiningManager {
    pub fn new(storage_dir: PathBuf) -> Self {
        let state = MiningState::default();
        // Phase 1 keeps the device key in-memory; Phase 2 binds it to wallet
        // signer via secure_storage. Keygen failure here is fatal — the loop
        // cannot operate without a signing key.
        let key = MlDsa65SigningKey::generate()
            .expect("Phase 1 ML-DSA-65 keygen must succeed at startup");
        Self {
            state: Arc::new(RwLock::new(state)),
            storage_dir,
            backend: Arc::new(CpuBackend),
            signing_key: Arc::new(RwLock::new(key)),
        }
    }

    pub async fn get_state(&self) -> MiningState {
        self.state.read().await.clone()
    }

    pub async fn set_privacy(&self, privacy: PrivacyLevel) {
        self.state.write().await.privacy = privacy;
    }

    /// Phase-1 dev mining wallet: a stable, per-install EVM-style address
    /// persisted under the mining storage dir so accrued rewards survive
    /// restarts. The frontend re-homes rewards to the user's connected wallet
    /// once it resolves (the boot auto-start needs an address before then).
    pub fn ensure_dev_wallet(&self) -> String {
        let path = self.storage_dir.join("wallet.addr");
        if let Ok(addr) = std::fs::read_to_string(&path) {
            let addr = addr.trim().to_string();
            if !addr.is_empty() {
                return addr;
            }
        }
        use rand::RngCore;
        let mut bytes = [0u8; 20];
        rand::thread_rng().fill_bytes(&mut bytes);
        let addr = format!(
            "0x{}",
            bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
        );
        let _ = std::fs::create_dir_all(&self.storage_dir);
        let _ = std::fs::write(&path, &addr);
        addr
    }

    pub async fn start_mining(&self, app: AppHandle, wallet_address: String, chain_id: u64) {
        {
            let mut s = self.state.write().await;
            if s.is_mining {
                return;
            }
            if !wallet_address.is_empty() {
                s.wallet_address = wallet_address;
            }
            s.is_mining = true;
            s.backend = self.backend.name().to_string();
            // Re-load history so local_pending_wei reflects disk on resume.
            let history = read_history(&self.storage_dir, &s.wallet_address).unwrap_or_default();
            s.local_pending_wei = sum_pending(&history).to_string();
            s.history_count = history.len();
        }

        let state = self.state.clone();
        let storage = self.storage_dir.clone();
        let backend = self.backend.clone();
        let key = self.signing_key.clone();

        tauri::async_runtime::spawn(async move {
            let mut ticker = interval(Duration::from_secs(TICK_SECS));
            loop {
                ticker.tick().await;
                if !state.read().await.is_mining {
                    break;
                }

                let (wallet, privacy) = {
                    let s = state.read().await;
                    (s.wallet_address.clone(), s.privacy)
                };

                if wallet.is_empty() {
                    continue;
                }

                match tick_once(&*backend, &key, &storage, &wallet, chain_id, privacy).await {
                    Ok(record) => {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let mut s = state.write().await;
                        s.last_updated = now;
                        let history = read_history(&storage, &wallet).unwrap_or_default();
                        s.local_pending_wei = sum_pending(&history).to_string();
                        s.history_count = history.len();
                        let snapshot = s.clone();
                        drop(s);
                        let _ = app.emit("mining://progress", &record);
                        let _ = app.emit("mining-update", &snapshot);
                    }
                    Err(e) => {
                        log::error!("mining tick failed: {e}");
                        let _ = app.emit("mining://error", e.to_string());
                    }
                }
            }
        });
    }

    pub async fn stop_mining(&self) {
        self.state.write().await.is_mining = false;
    }

    pub async fn get_history(&self) -> Vec<ProofRecord> {
        let wallet = self.state.read().await.wallet_address.clone();
        if wallet.is_empty() {
            return vec![];
        }
        read_history(&self.storage_dir, &wallet).unwrap_or_default()
    }

    pub async fn get_local_pending_wei(&self) -> String {
        self.state.read().await.local_pending_wei.clone()
    }

    pub async fn get_wallet_address(&self) -> String {
        self.state.read().await.wallet_address.clone()
    }
}

async fn tick_once(
    backend: &dyn MiningBackend,
    key: &Arc<RwLock<MlDsa65SigningKey>>,
    storage: &PathBuf,
    wallet: &str,
    chain_id: u64,
    privacy: PrivacyLevel,
) -> Result<ProofRecord, MiningError> {
    let device_id = derive_device_id(wallet);
    let compute_minutes: u32 = 1; // 1 proof per 60s tick == 1 compute-minute

    let key_guard = key.read().await;
    let next = backend.next_proof(device_id, privacy, compute_minutes, &*key_guard)?;
    drop(key_guard);

    // Local verification through the dylib — must pass before we credit reward.
    let ok = precompile::verify_mldsa(&next.public_key, &next.proof_bytes, &next.signature)?;
    if !ok {
        return Err(MiningError::Crypto(
            "ML-DSA verify failed against precompile".into(),
        ));
    }

    let work_id = precompile::compute_work_id(&device_id, &next.nonce, chain_id)?;

    // Local spent-set check (defends against replay within this device).
    let mut history = read_history(storage, wallet).unwrap_or_default();
    let work_id_hex = hex::encode(work_id);
    if history.iter().any(|r| r.work_id_hex == work_id_hex) {
        return Err(MiningError::Crypto(format!(
            "work id collision for {work_id_hex}"
        )));
    }

    let reward = precompile::calculate_reward(&next.proof_bytes, chain_id)?;

    let record = ProofRecord {
        work_id_hex,
        reward_wei: reward.to_string(),
        chain_id,
        status: "locally_verified".to_string(),
        timestamp: next.timestamp,
        privacy: privacy.as_u16(),
        compute_minutes,
        backend: backend.name().to_string(),
    };

    history.push(record.clone());
    if history.len() > HISTORY_CAP {
        let drop_n = history.len() - HISTORY_CAP;
        history.drain(0..drop_n);
    }
    write_history(storage, wallet, &history)?;
    Ok(record)
}

pub(crate) fn sum_pending(history: &[ProofRecord]) -> u128 {
    history
        .iter()
        .filter(|r| r.status == "locally_verified")
        .map(|r| r.reward_wei.parse::<u128>().unwrap_or(0))
        .fold(0u128, |a, b| a.saturating_add(b))
}

fn history_path(dir: &PathBuf, wallet: &str) -> PathBuf {
    dir.join(wallet).join("history.json")
}

pub(crate) fn read_history(dir: &PathBuf, wallet: &str) -> Result<Vec<ProofRecord>, MiningError> {
    let path = history_path(dir, wallet);
    if !path.exists() {
        return Ok(vec![]);
    }
    let bytes = std::fs::read(&path)?;
    let history: Vec<ProofRecord> = serde_json::from_slice(&bytes)?;
    Ok(history)
}

pub(crate) fn write_history(
    dir: &PathBuf,
    wallet: &str,
    history: &[ProofRecord],
) -> Result<(), MiningError> {
    let path = history_path(dir, wallet);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(history)?;
    std::fs::write(&path, bytes)?;
    Ok(())
}

// Device ID = BLAKE3(wallet_address_lowercase)[..32]. Stable per wallet.
fn derive_device_id(wallet: &str) -> [u8; 32] {
    let mut h = blake3::Hasher::new();
    h.update(wallet.to_lowercase().as_bytes());
    let mut out = [0u8; 32];
    h.finalize_xof().fill(&mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn fresh_dir() -> TempDir {
        TempDir::new().expect("tempdir")
    }

    #[test]
    fn history_round_trip() {
        let tmp = fresh_dir();
        let dir = tmp.path().to_path_buf();
        let wallet = "0xabc";
        let rec = ProofRecord {
            work_id_hex: "deadbeef".repeat(8),
            reward_wei: "1000000000000000000".to_string(),
            chain_id: 96369,
            status: "locally_verified".into(),
            timestamp: 1_700_000_000,
            privacy: 1,
            compute_minutes: 1,
            backend: "CPU".into(),
        };
        write_history(&dir, wallet, &[rec.clone()]).unwrap();
        let read = read_history(&dir, wallet).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].work_id_hex, rec.work_id_hex);
        assert_eq!(read[0].reward_wei, rec.reward_wei);
    }

    #[test]
    fn sum_pending_filters_status() {
        let mut h = vec![];
        for i in 0..3 {
            h.push(ProofRecord {
                work_id_hex: format!("{i:064x}"),
                reward_wei: "1000".to_string(),
                chain_id: 1,
                status: "locally_verified".into(),
                timestamp: 0,
                privacy: 1,
                compute_minutes: 1,
                backend: "CPU".into(),
            });
        }
        h.push(ProofRecord {
            work_id_hex: format!("{:064x}", 99),
            reward_wei: "555".into(),
            chain_id: 1,
            status: "claimed".into(),
            timestamp: 0,
            privacy: 1,
            compute_minutes: 1,
            backend: "CPU".into(),
        });
        assert_eq!(sum_pending(&h), 3000u128);
    }

    // Full pipeline: backend builds proof, dylib verifies, dylib computes
    // work id, dylib computes reward, history persists, sum updates.
    #[tokio::test]
    async fn tick_once_persists_a_locally_verified_record() {
        let tmp = fresh_dir();
        let dir = tmp.path().to_path_buf();
        let wallet = "0x1111111111111111111111111111111111111111";
        let key = Arc::new(RwLock::new(MlDsa65SigningKey::generate().unwrap()));
        let backend: Arc<dyn MiningBackend> = Arc::new(CpuBackend);

        let rec = tick_once(
            &*backend,
            &key,
            &dir,
            wallet,
            96369,
            PrivacyLevel::Confidential,
        )
        .await
        .expect("tick");

        assert_eq!(rec.status, "locally_verified");
        assert_eq!(rec.chain_id, 96369);
        assert_eq!(rec.privacy, 3);
        assert_eq!(rec.compute_minutes, 1);
        // Confidential 1.0x * 1 min * 1e18 wei.
        assert_eq!(rec.reward_wei, "1000000000000000000");
        assert_eq!(rec.work_id_hex.len(), 64);

        let history = read_history(&dir, wallet).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].work_id_hex, rec.work_id_hex);
    }

    #[test]
    fn history_cap_truncates_old_entries() {
        let tmp = fresh_dir();
        let dir = tmp.path().to_path_buf();
        let wallet = "0xfeed";
        let mut h: Vec<ProofRecord> = (0..(HISTORY_CAP + 5))
            .map(|i| ProofRecord {
                work_id_hex: format!("{i:064x}"),
                reward_wei: "1".into(),
                chain_id: 1,
                status: "locally_verified".into(),
                timestamp: i as u64,
                privacy: 1,
                compute_minutes: 1,
                backend: "CPU".into(),
            })
            .collect();
        let drop_n = h.len() - HISTORY_CAP;
        h.drain(0..drop_n);
        assert_eq!(h.len(), HISTORY_CAP);
        // Oldest kept entry corresponds to index drop_n.
        write_history(&dir, wallet, &h).unwrap();
        let read = read_history(&dir, wallet).unwrap();
        assert_eq!(read.len(), HISTORY_CAP);
        assert_eq!(read[0].timestamp as usize, drop_n);
    }
}
