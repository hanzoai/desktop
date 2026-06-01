// SPDX-License-Identifier: Apache-2.0
//! Phase 1 work-proof construction. Byte layout MUST match
//! lux/precompile/ai/ai_mining.go (see WorkProof*Offset constants there).

use fips204::ml_dsa_65;
use fips204::traits::{SerDes, Signer};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::mining::error::MiningError;

// Layout offsets are mirrored byte-for-byte from ai_mining.go.
const WORK_PROOF_DEVICE_ID_OFFSET: usize = 0;
const WORK_PROOF_NONCE_OFFSET: usize = 32;
const WORK_PROOF_TIMESTAMP_OFFSET: usize = 64;
const WORK_PROOF_PRIVACY_OFFSET: usize = 72;
const WORK_PROOF_COMPUTE_MINS_OFFSET: usize = 74;
const WORK_PROOF_TEE_QUOTE_OFFSET: usize = 78;
pub const WORK_PROOF_MIN_SIZE: usize = 78;

// FIPS 204 sizes.
pub const ML_DSA_65_PUBLIC_KEY_SIZE: usize = 1952;
pub const ML_DSA_65_SIGNATURE_SIZE: usize = 3309;
pub const ML_DSA_65_PRIVATE_KEY_SIZE: usize = 4032;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PrivacyLevel {
    Public = 1,
    Private = 2,
    Confidential = 3,
    Sovereign = 4,
}

impl PrivacyLevel {
    pub fn as_u16(self) -> u16 {
        self as u16
    }
}

impl Default for PrivacyLevel {
    fn default() -> Self {
        Self::Public
    }
}

/// ML-DSA-65 signing key wrapped over the FIPS 204 reference implementation.
pub struct MlDsa65SigningKey {
    pk: ml_dsa_65::PublicKey,
    sk: ml_dsa_65::PrivateKey,
}

impl MlDsa65SigningKey {
    /// Generate a fresh ML-DSA-65 keypair.
    pub fn generate() -> Result<Self, MiningError> {
        let (pk, sk) = ml_dsa_65::try_keygen()
            .map_err(|e| MiningError::Crypto(format!("ml-dsa keygen: {e:?}")))?;
        Ok(Self { pk, sk })
    }

    /// Public key bytes (1952 bytes per FIPS 204).
    pub fn public_key_bytes(&self) -> [u8; ML_DSA_65_PUBLIC_KEY_SIZE] {
        self.pk.clone().into_bytes()
    }

    /// Sign a message; output is 3309 bytes per FIPS 204.
    pub fn sign(&self, message: &[u8]) -> Result<[u8; ML_DSA_65_SIGNATURE_SIZE], MiningError> {
        self.sk
            .try_sign(message, &[])
            .map_err(|e| MiningError::Crypto(format!("ml-dsa sign: {e:?}")))
    }
}

/// Build a work proof in the exact byte layout the ai precompile expects.
/// Returns the proof bytes (no signature concatenated; signature flows
/// separately to verifyMLDSA selector input).
pub fn build_proof(
    device_id: [u8; 32],
    privacy: PrivacyLevel,
    compute_minutes: u32,
    timestamp: u64,
    nonce: [u8; 32],
    tee_quote: &[u8],
) -> Vec<u8> {
    let size = WORK_PROOF_MIN_SIZE + tee_quote.len();
    let mut proof = vec![0u8; size];

    proof[WORK_PROOF_DEVICE_ID_OFFSET..WORK_PROOF_NONCE_OFFSET].copy_from_slice(&device_id);
    proof[WORK_PROOF_NONCE_OFFSET..WORK_PROOF_TIMESTAMP_OFFSET].copy_from_slice(&nonce);
    proof[WORK_PROOF_TIMESTAMP_OFFSET..WORK_PROOF_PRIVACY_OFFSET]
        .copy_from_slice(&timestamp.to_be_bytes());
    proof[WORK_PROOF_PRIVACY_OFFSET..WORK_PROOF_COMPUTE_MINS_OFFSET]
        .copy_from_slice(&privacy.as_u16().to_be_bytes());
    proof[WORK_PROOF_COMPUTE_MINS_OFFSET..WORK_PROOF_TEE_QUOTE_OFFSET]
        .copy_from_slice(&compute_minutes.to_be_bytes());

    if !tee_quote.is_empty() {
        proof[WORK_PROOF_TEE_QUOTE_OFFSET..].copy_from_slice(tee_quote);
    }

    proof
}

/// Generate a random 32-byte nonce.
pub fn random_nonce() -> [u8; 32] {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    buf
}

/// Parse a work proof — used to round-trip-test against build_proof.
#[derive(Debug, PartialEq, Eq)]
pub struct ParsedProof {
    pub device_id: [u8; 32],
    pub nonce: [u8; 32],
    pub timestamp: u64,
    pub privacy: u16,
    pub compute_minutes: u32,
    pub tee_quote: Vec<u8>,
}

pub fn parse_proof(proof: &[u8]) -> Result<ParsedProof, MiningError> {
    if proof.len() < WORK_PROOF_MIN_SIZE {
        return Err(MiningError::InvalidProof);
    }
    let mut device_id = [0u8; 32];
    device_id.copy_from_slice(&proof[WORK_PROOF_DEVICE_ID_OFFSET..WORK_PROOF_NONCE_OFFSET]);
    let mut nonce = [0u8; 32];
    nonce.copy_from_slice(&proof[WORK_PROOF_NONCE_OFFSET..WORK_PROOF_TIMESTAMP_OFFSET]);
    let timestamp = u64::from_be_bytes(
        proof[WORK_PROOF_TIMESTAMP_OFFSET..WORK_PROOF_PRIVACY_OFFSET]
            .try_into()
            .map_err(|_| MiningError::InvalidProof)?,
    );
    let privacy = u16::from_be_bytes(
        proof[WORK_PROOF_PRIVACY_OFFSET..WORK_PROOF_COMPUTE_MINS_OFFSET]
            .try_into()
            .map_err(|_| MiningError::InvalidProof)?,
    );
    let compute_minutes = u32::from_be_bytes(
        proof[WORK_PROOF_COMPUTE_MINS_OFFSET..WORK_PROOF_TEE_QUOTE_OFFSET]
            .try_into()
            .map_err(|_| MiningError::InvalidProof)?,
    );
    let tee_quote = proof[WORK_PROOF_TEE_QUOTE_OFFSET..].to_vec();
    Ok(ParsedProof {
        device_id,
        nonce,
        timestamp,
        privacy,
        compute_minutes,
        tee_quote,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors TestParseWorkProof in ai_mining_test.go: BuildWorkProof followed
    // by ParseWorkProof must round-trip exactly.
    #[test]
    fn build_proof_matches_canonical_layout() {
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
        let timestamp: u64 = 1_700_000_000;
        let privacy = PrivacyLevel::Confidential;
        let compute_minutes: u32 = 60;
        let tee_quote = b"tee quote data".to_vec();

        let proof = build_proof(
            device_id,
            privacy,
            compute_minutes,
            timestamp,
            nonce,
            &tee_quote,
        );

        // Length: 78 + len(tee_quote)
        assert_eq!(proof.len(), WORK_PROOF_MIN_SIZE + tee_quote.len());

        // Byte-for-byte: device id at [0..32]
        assert_eq!(&proof[0..32], &device_id);
        // Nonce at [32..64]
        assert_eq!(&proof[32..64], &nonce);
        // Timestamp big-endian at [64..72]
        assert_eq!(&proof[64..72], &timestamp.to_be_bytes());
        // Privacy big-endian uint16 at [72..74]
        assert_eq!(&proof[72..74], &(PrivacyLevel::Confidential.as_u16()).to_be_bytes());
        // Compute minutes big-endian uint32 at [74..78]
        assert_eq!(&proof[74..78], &compute_minutes.to_be_bytes());
        // TEE quote tail
        assert_eq!(&proof[78..], &tee_quote[..]);

        let parsed = parse_proof(&proof).unwrap();
        assert_eq!(parsed.device_id, device_id);
        assert_eq!(parsed.nonce, nonce);
        assert_eq!(parsed.timestamp, timestamp);
        assert_eq!(parsed.privacy, privacy.as_u16());
        assert_eq!(parsed.compute_minutes, compute_minutes);
        assert_eq!(parsed.tee_quote, tee_quote);
    }

    // Specific privacy-level encodings used by the precompile reward path.
    #[test]
    fn privacy_levels_serialize_to_canonical_u16() {
        assert_eq!(PrivacyLevel::Public.as_u16(), 1);
        assert_eq!(PrivacyLevel::Private.as_u16(), 2);
        assert_eq!(PrivacyLevel::Confidential.as_u16(), 3);
        assert_eq!(PrivacyLevel::Sovereign.as_u16(), 4);
    }

    // ML-DSA-65 sign/verify round-trip via fips204 — sizes match FIPS 204.
    #[test]
    fn ml_dsa_65_sign_produces_canonical_sized_output() {
        let key = MlDsa65SigningKey::generate().expect("keygen");
        let pk = key.public_key_bytes();
        assert_eq!(pk.len(), ML_DSA_65_PUBLIC_KEY_SIZE);

        let msg = b"phase 1 work proof";
        let sig = key.sign(msg).expect("sign");
        assert_eq!(sig.len(), ML_DSA_65_SIGNATURE_SIZE);

        // Round-trip: same signing key signs and we can verify locally
        // (precompile-side verify is exercised in precompile.rs).
        use fips204::traits::Verifier;
        let pk_obj = ml_dsa_65::PublicKey::try_from_bytes(pk).expect("pk parse");
        assert!(pk_obj.verify(msg, &sig, &[]));
    }
}
