// SPDX-License-Identifier: Apache-2.0
//! Native-Rust AI-mining precompile — the pure-Rust port of
//! `lux/precompile/ai/ai_mining.go`. Same address, selectors, gas, and reward
//! math, but reimplemented natively so hanzo mines with **no** Go shared
//! library, no `libluxprecompile.so`, no `go.sum`, and identical behaviour on
//! every platform. The crypto is FIPS 204 ML-DSA (`fips204`) + BLAKE3
//! (`blake3`) — both already in the dependency tree.
//!
//! The stateful selectors (`is_spent`/`mark_spent` — the double-spend ledger)
//! belong to the EVM journal and are served by the revm precompile in the node
//! (tier 2). Locally the `MiningManager` keeps its own spent cache, so they are
//! intentional no-ops here.

use blake3::Hasher;
use fips204::traits::{SerDes, Verifier};

use crate::mining::error::MiningError;
use crate::mining::proof::{parse_proof, ML_DSA_65_PUBLIC_KEY_SIZE, ML_DSA_65_SIGNATURE_SIZE};

/// Address of the AI-mining precompile (`0x0300…0000`) — same on every brand.
pub const AI_MINING_ADDR: &str = "0x0300000000000000000000000000000000000000";

// --- Canonical ABI (mirrors ai_mining.go) — consumed by the revm precompile
// registration in the node (tier 2). Kept here as the single source of truth.
pub const SELECTOR_VERIFY_MLDSA: [u8; 4] = [0x01, 0x00, 0x00, 0x00];
pub const SELECTOR_CALCULATE_REWARD: [u8; 4] = [0x02, 0x00, 0x00, 0x00];
pub const SELECTOR_VERIFY_TEE: [u8; 4] = [0x03, 0x00, 0x00, 0x00];
pub const SELECTOR_IS_SPENT: [u8; 4] = [0x04, 0x00, 0x00, 0x00];
pub const SELECTOR_MARK_SPENT: [u8; 4] = [0x05, 0x00, 0x00, 0x00];
pub const SELECTOR_COMPUTE_WORK_ID: [u8; 4] = [0x06, 0x00, 0x00, 0x00];

pub const GAS_VERIFY_MLDSA: u64 = 3000;
pub const GAS_CALCULATE_REWARD: u64 = 1000;
pub const GAS_VERIFY_TEE: u64 = 5000;
pub const GAS_IS_SPENT: u64 = 100;
pub const GAS_MARK_SPENT: u64 = 5000;
pub const GAS_COMPUTE_WORK_ID: u64 = 50;

// FIPS 204 public-key sizes — used to dispatch ML-DSA verification by level.
const ML_DSA_44_PUBLIC_KEY_SIZE: usize = 1312;
const ML_DSA_44_SIGNATURE_SIZE: usize = 2420;
const ML_DSA_87_PUBLIC_KEY_SIZE: usize = 2592;
const ML_DSA_87_SIGNATURE_SIZE: usize = 4627;

// Privacy-level reward multipliers in basis points (10000 = 1.0x) — mirrors
// ai_mining.go `privacyMultipliers`.
const MUL_PUBLIC: u128 = 2500; // 0.25x
const MUL_PRIVATE: u128 = 5000; // 0.50x
const MUL_CONFIDENTIAL: u128 = 10000; // 1.00x
const MUL_SOVEREIGN: u128 = 15000; // 1.50x
/// 1 AI token = 1e18 wei — the base reward per compute minute.
const WEI_PER_TOKEN: u128 = 1_000_000_000_000_000_000;

/// `verifyMLDSA(pubkey, message, signature) -> bool`. Dispatches ML-DSA-44 /
/// 65 / 87 by public-key size (matches ai_mining.go). Hanzo signs with
/// ML-DSA-65. A malformed key/signature or unsupported size verifies as
/// `false` rather than erroring (a bad proof is simply rejected).
pub fn verify_mldsa(pubkey: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, MiningError> {
    match pubkey.len() {
        ML_DSA_44_PUBLIC_KEY_SIZE => {
            use fips204::ml_dsa_44;
            let pk_bytes: [u8; ML_DSA_44_PUBLIC_KEY_SIZE] = match pubkey.try_into() {
                Ok(b) => b,
                Err(_) => return Ok(false),
            };
            let pk = match ml_dsa_44::PublicKey::try_from_bytes(pk_bytes) {
                Ok(p) => p,
                Err(_) => return Ok(false),
            };
            let sig: [u8; ML_DSA_44_SIGNATURE_SIZE] = match signature.try_into() {
                Ok(s) => s,
                Err(_) => return Ok(false),
            };
            Ok(pk.verify(message, &sig, &[]))
        }
        ML_DSA_65_PUBLIC_KEY_SIZE => {
            use fips204::ml_dsa_65;
            let pk_bytes: [u8; ML_DSA_65_PUBLIC_KEY_SIZE] = match pubkey.try_into() {
                Ok(b) => b,
                Err(_) => return Ok(false),
            };
            let pk = match ml_dsa_65::PublicKey::try_from_bytes(pk_bytes) {
                Ok(p) => p,
                Err(_) => return Ok(false),
            };
            let sig: [u8; ML_DSA_65_SIGNATURE_SIZE] = match signature.try_into() {
                Ok(s) => s,
                Err(_) => return Ok(false),
            };
            Ok(pk.verify(message, &sig, &[]))
        }
        ML_DSA_87_PUBLIC_KEY_SIZE => {
            use fips204::ml_dsa_87;
            let pk_bytes: [u8; ML_DSA_87_PUBLIC_KEY_SIZE] = match pubkey.try_into() {
                Ok(b) => b,
                Err(_) => return Ok(false),
            };
            let pk = match ml_dsa_87::PublicKey::try_from_bytes(pk_bytes) {
                Ok(p) => p,
                Err(_) => return Ok(false),
            };
            let sig: [u8; ML_DSA_87_SIGNATURE_SIZE] = match signature.try_into() {
                Ok(s) => s,
                Err(_) => return Ok(false),
            };
            Ok(pk.verify(message, &sig, &[]))
        }
        _ => Ok(false),
    }
}

/// `computeWorkId(deviceId, nonce, chainId) -> bytes32`, defined as
/// `BLAKE3(deviceId || nonce || chainId_be)` — byte-identical to ai_mining.go.
pub fn compute_work_id(
    device_id: &[u8; 32],
    nonce: &[u8; 32],
    chain_id: u64,
) -> Result<[u8; 32], MiningError> {
    let mut h = Hasher::new();
    h.update(device_id);
    h.update(nonce);
    h.update(&chain_id.to_be_bytes());
    let mut out = [0u8; 32];
    h.finalize_xof().fill(&mut out);
    Ok(out)
}

/// `isSpent(workId) -> bool`. Stateful selector: the EVM journal owns the spent
/// set (revm precompile, tier 2). Locally the `MiningManager` keeps its own
/// cache, so this reports "not spent".
pub fn is_spent(_work_id: &[u8; 32]) -> Result<bool, MiningError> {
    Ok(false)
}

/// `markSpent(workId)` — local cache only in Phase 1; the on-chain state write
/// happens in Phase 2 via a wallet transaction.
pub fn mark_spent(_work_id: &[u8; 32]) -> Result<(), MiningError> {
    Ok(())
}

/// `calculateReward(workProof, chainId) -> wei`. Reward =
/// `1e18 * computeMinutes * multiplier / 10000` (mirrors ai_mining.go
/// `CalculateReward`). Reward fits in `u128` for any sane Phase-1 interval.
pub fn calculate_reward(work_proof: &[u8], _chain_id: u64) -> Result<u128, MiningError> {
    let parsed = parse_proof(work_proof)?;
    let multiplier = match parsed.privacy {
        1 => MUL_PUBLIC,
        2 => MUL_PRIVATE,
        3 => MUL_CONFIDENTIAL,
        4 => MUL_SOVEREIGN,
        other => {
            return Err(MiningError::Precompile(format!(
                "calculate_reward: unknown privacy level {other}"
            )))
        }
    };
    let reward = WEI_PER_TOKEN
        .saturating_mul(parsed.compute_minutes as u128)
        .saturating_mul(multiplier)
        / 10_000;
    Ok(reward)
}

/// `verifyTEE(receipt, signature) -> bool`. Phase-1 attestation check: a
/// non-empty receipt of at least 48 bytes and a signature of at least 64 bytes
/// (mirrors ai_mining.go `VerifyTEE`/`verifyTEESignature`). Full remote
/// attestation lands in Phase 2; TEE only gates reward eligibility, never
/// consensus.
pub fn verify_tee(receipt: &[u8], signature: &[u8]) -> Result<bool, MiningError> {
    Ok(receipt.len() >= 48 && signature.len() >= 64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mining::proof::{build_proof, MlDsa65SigningKey, PrivacyLevel};

    // BLAKE3(deviceId || nonce || chainId_be) — the canonical work-id.
    fn local_work_id(device_id: &[u8; 32], nonce: &[u8; 32], chain_id: u64) -> [u8; 32] {
        let mut h = Hasher::new();
        h.update(device_id);
        h.update(nonce);
        h.update(&chain_id.to_be_bytes());
        let mut out = [0u8; 32];
        h.finalize_xof().fill(&mut out);
        out
    }

    #[test]
    fn compute_work_id_matches_canonical_blake3() {
        let mut device_id = [0u8; 32];
        device_id[..3].copy_from_slice(&[0x01, 0x02, 0x03]);
        let mut nonce = [0u8; 32];
        nonce[..3].copy_from_slice(&[0x04, 0x05, 0x06]);
        let chain_id: u64 = 96369;

        let from_precompile = compute_work_id(&device_id, &nonce, chain_id).expect("compute");
        assert_eq!(from_precompile, local_work_id(&device_id, &nonce, chain_id));

        // Different chain id -> different work id.
        let other = compute_work_id(&device_id, &nonce, 36963).expect("compute");
        assert_ne!(from_precompile, other);
    }

    #[test]
    fn verify_mldsa_round_trips_native() {
        let key = MlDsa65SigningKey::generate().expect("keygen");
        let pk = key.public_key_bytes();
        let msg = b"phase 1 mining message";
        let sig = key.sign(msg).expect("sign");

        assert!(verify_mldsa(&pk, msg, &sig).expect("verify"));
        // Wrong message must not verify.
        assert!(!verify_mldsa(&pk, b"different message", &sig).expect("verify"));
        // Wrong-sized key verifies false (not an error).
        assert!(!verify_mldsa(&pk[..100], msg, &sig).expect("verify"));
    }

    #[test]
    fn calculate_reward_matches_canonical_formula() {
        let device_id = [0x11u8; 32];
        let nonce = [0x22u8; 32];

        // Confidential: 1.0x, 60 minutes -> 60e18 wei.
        let proof = build_proof(device_id, PrivacyLevel::Confidential, 60, 1_700_000_000, nonce, &[]);
        assert_eq!(
            calculate_reward(&proof, 96369).expect("reward"),
            60 * WEI_PER_TOKEN
        );

        // Public: 0.25x, 10 minutes -> 2.5e18 wei.
        let proof2 = build_proof(device_id, PrivacyLevel::Public, 10, 1_700_000_000, nonce, &[]);
        assert_eq!(
            calculate_reward(&proof2, 96369).expect("reward"),
            10 * WEI_PER_TOKEN * 2500 / 10_000
        );

        // Sovereign: 1.5x, 4 minutes -> 6e18 wei.
        let proof3 = build_proof(device_id, PrivacyLevel::Sovereign, 4, 1_700_000_000, nonce, &[]);
        assert_eq!(
            calculate_reward(&proof3, 96369).expect("reward"),
            4 * WEI_PER_TOKEN * 15000 / 10_000
        );
    }

    #[test]
    fn verify_tee_phase1_length_gate() {
        assert!(!verify_tee(&[], &[]).expect("tee"));
        assert!(!verify_tee(&[0u8; 48], &[0u8; 63]).expect("tee"));
        assert!(verify_tee(&[0u8; 48], &[0u8; 64]).expect("tee"));
    }
}
