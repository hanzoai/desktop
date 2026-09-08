// SPDX-License-Identifier: Apache-2.0
//! Pluggable mining backend. Phase 1 ships exactly one impl (CpuBackend).
//! A future GPU backend plugs in as a sibling impl behind this same trait.

use crate::mining::error::MiningError;
use crate::mining::proof::{build_proof, random_nonce, MlDsa65SigningKey, PrivacyLevel};

/// A mining backend produces signed work proofs. The trait is the only seam
/// between the manager loop and the proof source.
pub trait MiningBackend: Send + Sync {
    /// Human-facing label (rendered in the dashboard).
    fn name(&self) -> &str;

    /// Build the next work proof and the matching signature/pubkey.
    fn next_proof(
        &self,
        device_id: [u8; 32],
        privacy: PrivacyLevel,
        compute_minutes: u32,
        signing_key: &MlDsa65SigningKey,
    ) -> Result<NextProof, MiningError>;
}

pub struct NextProof {
    pub proof_bytes: Vec<u8>,
    pub nonce: [u8; 32],
    pub signature: Vec<u8>,
    pub public_key: Vec<u8>,
    pub timestamp: u64,
}

/// CPU backend: no parallel hardware, just a fresh nonce + canonical proof.
pub struct CpuBackend;

impl MiningBackend for CpuBackend {
    fn name(&self) -> &str {
        "CPU"
    }

    fn next_proof(
        &self,
        device_id: [u8; 32],
        privacy: PrivacyLevel,
        compute_minutes: u32,
        signing_key: &MlDsa65SigningKey,
    ) -> Result<NextProof, MiningError> {
        let nonce = random_nonce();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let proof_bytes = build_proof(device_id, privacy, compute_minutes, timestamp, nonce, &[]);

        // Sign the proof bytes themselves so on-chain verifiers can re-check.
        let sig = signing_key.sign(&proof_bytes)?;
        let pk = signing_key.public_key_bytes();
        Ok(NextProof {
            proof_bytes,
            nonce,
            signature: sig.to_vec(),
            public_key: pk.to_vec(),
            timestamp,
        })
    }
}
