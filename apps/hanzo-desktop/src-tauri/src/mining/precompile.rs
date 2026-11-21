// SPDX-License-Identifier: Apache-2.0
//! Thin Rust wrapper over the lux AI-mining precompile dylib.
//! All selectors / gas / layout live in lux/precompile/ai/ai_mining.go and
//! are reached through luxprecompile_sys::run — never reimplemented here.

use crate::mining::error::MiningError;

// Address of the AI-mining precompile (0x0300...0000) — same on every brand.
pub const AI_MINING_ADDR: &str = "0x0300000000000000000000000000000000000000";

// Selectors — first 4 bytes of input. Mirrors module.go SelectorXxx constants.
const SELECTOR_VERIFY_MLDSA: [u8; 4] = [0x01, 0x00, 0x00, 0x00];
const SELECTOR_CALCULATE_REWARD: [u8; 4] = [0x02, 0x00, 0x00, 0x00];
const SELECTOR_VERIFY_TEE: [u8; 4] = [0x03, 0x00, 0x00, 0x00];
const SELECTOR_IS_SPENT: [u8; 4] = [0x04, 0x00, 0x00, 0x00];
const SELECTOR_MARK_SPENT: [u8; 4] = [0x05, 0x00, 0x00, 0x00];
const SELECTOR_COMPUTE_WORK_ID: [u8; 4] = [0x06, 0x00, 0x00, 0x00];

// Per-selector gas budgets (matches ai_mining.go Gas* consts).
const GAS_VERIFY_MLDSA: u64 = 3000;
const GAS_CALCULATE_REWARD: u64 = 1000;
const GAS_VERIFY_TEE: u64 = 5000;
const GAS_IS_SPENT: u64 = 100;
const GAS_MARK_SPENT: u64 = 5000;
const GAS_COMPUTE_WORK_ID: u64 = 50;

fn put_u32_be(dst: &mut Vec<u8>, v: u32) {
    dst.extend_from_slice(&v.to_be_bytes());
}

/// verifyMLDSA(pubkey, message, signature) -> bool
/// Input layout (after 4-byte selector): u32 pkLen | pk | u32 msgLen | msg | u32 sigLen | sig
pub fn verify_mldsa(pubkey: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, MiningError> {
    let mut input = Vec::with_capacity(4 + 4 + pubkey.len() + 4 + message.len() + 4 + signature.len());
    input.extend_from_slice(&SELECTOR_VERIFY_MLDSA);
    put_u32_be(&mut input, pubkey.len() as u32);
    input.extend_from_slice(pubkey);
    put_u32_be(&mut input, message.len() as u32);
    input.extend_from_slice(message);
    put_u32_be(&mut input, signature.len() as u32);
    input.extend_from_slice(signature);

    let result = luxprecompile_sys::run(AI_MINING_ADDR, &input, GAS_VERIFY_MLDSA + 1)
        .map_err(|e| MiningError::Precompile(format!("verify_mldsa: {e}")))?;
    Ok(decode_bool32(&result.output))
}

/// computeWorkId(deviceId, nonce, chainId) -> bytes32
/// Input: 32 bytes deviceId | 32 bytes nonce | u64 chainId BE.
pub fn compute_work_id(
    device_id: &[u8; 32],
    nonce: &[u8; 32],
    chain_id: u64,
) -> Result<[u8; 32], MiningError> {
    let mut input = Vec::with_capacity(4 + 32 + 32 + 8);
    input.extend_from_slice(&SELECTOR_COMPUTE_WORK_ID);
    input.extend_from_slice(device_id);
    input.extend_from_slice(nonce);
    input.extend_from_slice(&chain_id.to_be_bytes());

    let result = luxprecompile_sys::run(AI_MINING_ADDR, &input, GAS_COMPUTE_WORK_ID + 1)
        .map_err(|e| MiningError::Precompile(format!("compute_work_id: {e}")))?;
    if result.output.len() != 32 {
        return Err(MiningError::Precompile(format!(
            "compute_work_id: expected 32 bytes, got {}",
            result.output.len()
        )));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&result.output);
    Ok(out)
}

/// isSpent(workId) -> bool. Stateful precompile — returns RequiresState off
/// chain. We treat that as "not spent locally" (we maintain our own cache).
pub fn is_spent(_work_id: &[u8; 32]) -> Result<bool, MiningError> {
    // Stateful selector path is unreachable from the dylib without a
    // simulated EVM state. The MiningManager keeps its own spent cache; this
    // helper exists for symmetry and is intentionally a no-op locally.
    Ok(false)
}

/// markSpent(workId) — local cache only in Phase 1.
pub fn mark_spent(_work_id: &[u8; 32]) -> Result<(), MiningError> {
    // Stateful: the on-chain state-write happens in Phase 2 via a wallet tx.
    Ok(())
}

/// calculateReward(workProof, chainId) -> uint256 (32 bytes BE).
/// Input: workProof bytes | u64 chainId BE.
pub fn calculate_reward(work_proof: &[u8], chain_id: u64) -> Result<u128, MiningError> {
    let mut input = Vec::with_capacity(4 + work_proof.len() + 8);
    input.extend_from_slice(&SELECTOR_CALCULATE_REWARD);
    input.extend_from_slice(work_proof);
    input.extend_from_slice(&chain_id.to_be_bytes());

    let result = luxprecompile_sys::run(AI_MINING_ADDR, &input, GAS_CALCULATE_REWARD + 1)
        .map_err(|e| MiningError::Precompile(format!("calculate_reward: {e}")))?;
    if result.output.len() != 32 {
        return Err(MiningError::Precompile(format!(
            "calculate_reward: expected 32 bytes, got {}",
            result.output.len()
        )));
    }
    // Reward fits in u128 for any sane Phase-1 compute interval.
    let mut hi = [0u8; 16];
    hi.copy_from_slice(&result.output[..16]);
    if u128::from_be_bytes(hi) != 0 {
        // High 128 bits non-zero — clamp to u128::MAX rather than panic.
        return Ok(u128::MAX);
    }
    let mut lo = [0u8; 16];
    lo.copy_from_slice(&result.output[16..]);
    Ok(u128::from_be_bytes(lo))
}

/// verifyTEE(receipt, signature) -> bool. Input: u32 receiptLen | receipt | u32 sigLen | sig.
pub fn verify_tee(receipt: &[u8], signature: &[u8]) -> Result<bool, MiningError> {
    let mut input = Vec::with_capacity(4 + 4 + receipt.len() + 4 + signature.len());
    input.extend_from_slice(&SELECTOR_VERIFY_TEE);
    put_u32_be(&mut input, receipt.len() as u32);
    input.extend_from_slice(receipt);
    put_u32_be(&mut input, signature.len() as u32);
    input.extend_from_slice(signature);

    let result = luxprecompile_sys::run(AI_MINING_ADDR, &input, GAS_VERIFY_TEE + 1)
        .map_err(|e| MiningError::Precompile(format!("verify_tee: {e}")))?;
    Ok(decode_bool32(&result.output))
}

// uint256 ABI bool: 32-byte big-endian, 1 == true.
fn decode_bool32(bytes: &[u8]) -> bool {
    if bytes.len() != 32 {
        return false;
    }
    bytes[31] != 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mining::proof::{build_proof, MlDsa65SigningKey, PrivacyLevel};
    use blake3::Hasher;

    // BLAKE3(deviceId || nonce || chainId_be) — must match precompile output.
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
    fn compute_work_id_matches_local_blake3() {
        let device_id = {
            let mut d = [0u8; 32];
            d[0] = 0x01;
            d[1] = 0x02;
            d[2] = 0x03;
            d
        };
        let nonce = {
            let mut n = [0u8; 32];
            n[0] = 0x04;
            n[1] = 0x05;
            n[2] = 0x06;
            n
        };
        let chain_id: u64 = 96369;

        let from_precompile = compute_work_id(&device_id, &nonce, chain_id).expect("compile");
        let from_local = local_work_id(&device_id, &nonce, chain_id);
        assert_eq!(from_precompile, from_local);

        // Different chain id -> different work id.
        let other = compute_work_id(&device_id, &nonce, 36963).expect("call");
        assert_ne!(from_precompile, other);
    }

    #[test]
    fn verify_mldsa_round_trips_through_dylib() {
        let key = MlDsa65SigningKey::generate().expect("keygen");
        let pk = key.public_key_bytes();
        let msg = b"phase 1 mining message";
        let sig = key.sign(msg).expect("sign");

        let ok = verify_mldsa(&pk, msg, &sig).expect("verify");
        assert!(ok, "valid signature should verify through precompile");

        // Wrong message must not verify.
        let bad = verify_mldsa(&pk, b"different message", &sig).expect("verify");
        assert!(!bad);
    }

    #[test]
    fn calculate_reward_matches_canonical_formula() {
        // Confidential: 1.0x multiplier, 60 minutes -> 60e18 wei.
        let device_id = [0x11u8; 32];
        let nonce = [0x22u8; 32];
        let proof = build_proof(device_id, PrivacyLevel::Confidential, 60, 1_700_000_000, nonce, &[]);
        let reward = calculate_reward(&proof, 96369).expect("reward");
        let expected: u128 = 60 * 1_000_000_000_000_000_000u128;
        assert_eq!(reward, expected);

        // Public: 0.25x, 10 minutes -> 2.5e18 wei.
        let proof2 = build_proof(device_id, PrivacyLevel::Public, 10, 1_700_000_000, nonce, &[]);
        let reward2 = calculate_reward(&proof2, 96369).expect("reward");
        let expected2: u128 = 10 * 1_000_000_000_000_000_000u128 * 2500 / 10000;
        assert_eq!(reward2, expected2);
    }
}
