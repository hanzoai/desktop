// SPDX-License-Identifier: Apache-2.0
//! Phase-2 on-chain claim: settle locally-verified work proofs by calling the
//! AI-mining precompile `verifyAndMintWork` (`0x0300…0000`, selector
//! `0x07000000`) with the user's REAL EVM wallet. The signing key is derived
//! from the mnemonic in OS secure storage and **never** crosses into the
//! renderer — the frontend only ever sees the address.
//!
//! Crate choice — lean secp256k1 stack, not alloy/ethers (see `mining/LLM`):
//!   * `coins-bip39`  — mnemonic → BIP-44 (`m/44'/60'/0'/0/0`) → secp256k1
//!     `SigningKey` (the exact HD crate ethers-rs was built on; ethers itself
//!     is deprecated in favour of alloy, and alloy's 1.x provider tree is far
//!     more than a single EIP-1559 send needs).
//!   * `k256`         — recoverable ECDSA over secp256k1 (EVM `v/r/s`).
//!   * `rlp`          — EIP-2718 typed-tx (0x02) RLP payload.
//!   * `tiny-keccak`  — keccak-256 (address derivation + tx sighash).
//! Everything else (JSON-RPC) rides the `reqwest` client already in the tree.
//!
//! Calldata is byte-identical to `lux/precompile/ai/cross_chain_mining.go`
//! `parseTriple`:
//!   0x07000000
//!   || u32_be(len(workProof)) || workProof
//!   || u32_be(len(pubkey))    || pubkey
//!   || u32_be(len(signature)) || signature
//!   || u64_be(chainId)
//! `verifyAndMintWork` rejects read-only execution, so this MUST be a signed
//! transaction (an `eth_call` would return "cannot mint in read-only mode").

use coins_bip39::{English, Mnemonic};
use k256::ecdsa::{RecoveryId, Signature, SigningKey, VerifyingKey};
use rlp::RlpStream;
use std::path::PathBuf;
use tiny_keccak::{Hasher, Keccak};

use crate::mining::error::MiningError;
use crate::mining::{read_history, sum_pending, write_history, ProofRecord};

/// Selector for `verifyAndMintWork` — the first 4 calldata bytes the precompile
/// switches on (`SelectorVerifyAndMintWork` in `lux/precompile/ai/module.go`).
pub const SELECTOR_VERIFY_AND_MINT_WORK: [u8; 4] = [0x07, 0x00, 0x00, 0x00];

/// AI-mining precompile address — the transaction `to`. Same on every brand
/// (`ai::ContractAddress`); the precompile IS the atomic minter, so there is no
/// separate Solidity wrapper to target.
pub const AI_MINING_ADDR: [u8; 20] = [
    0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
];

/// EIP-2718 transaction type byte for EIP-1559 (`0x02`) dynamic-fee txs.
const TX_TYPE_EIP1559: u8 = 0x02;

/// Conservative gas limit for a single `verifyAndMintWork` call. The fused gas
/// inside the precompile is `GasVerifyMLDSA + GasCalculateReward + GasMarkSpent`
/// (≈9000), plus the 21000 base + calldata bytes; 200k leaves generous head-room
/// and is refunded down to actual on-chain.
const CLAIM_GAS_LIMIT: u64 = 200_000;

/// Mnemonic key in secure storage — must match the frontend
/// (`wallet.ts::saveMnemonicSecurely` → `secure_storage_set('wallet_mnemonic')`).
pub const WALLET_MNEMONIC_KEY: &str = "wallet_mnemonic";

/// BIP-44 path for the first Ethereum account — identical to what
/// `ethers.Wallet.fromPhrase` / `createRandom` use in `wallet.ts`, so the
/// derived address equals the address the frontend persisted.
const ETH_DERIVATION_PATH: &str = "m/44'/60'/0'/0/0";

/// Summary returned to the UI after a claim round.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ClaimReceipt {
    pub tx_hash: String,
    pub block_number: u64,
    pub claimed_count: usize,
    pub claimed_wei: String,
    pub from: String,
}

/// A secp256k1 wallet derived from the secure-storage mnemonic. Owns the
/// signing key in-process only; the renderer is handed `address` and nothing
/// else.
pub struct EvmWallet {
    signing_key: SigningKey,
    pub address: [u8; 20],
}

impl EvmWallet {
    /// Derive the wallet from a BIP-39 mnemonic phrase (the same phrase the
    /// frontend created and stored). Path `m/44'/60'/0'/0/0`.
    pub fn from_mnemonic(phrase: &str) -> Result<Self, MiningError> {
        let mnemonic = Mnemonic::<English>::new_from_phrase(phrase.trim())
            .map_err(|e| MiningError::Crypto(format!("bip39 parse: {e}")))?;
        // `XPriv: AsRef<k256::ecdsa::SigningKey>` — pull the secret out directly.
        let xpriv = mnemonic
            .derive_key(ETH_DERIVATION_PATH, None)
            .map_err(|e| MiningError::Crypto(format!("bip44 derive: {e}")))?;
        let signing_key: &SigningKey = xpriv.as_ref();
        let signing_key = signing_key.clone();
        let address = address_from_verifying_key(signing_key.verifying_key());
        Ok(Self {
            signing_key,
            address,
        })
    }

    /// Lowercase 0x-prefixed hex address (no EIP-55 checksum — matches how the
    /// mining history dir is keyed; the frontend lowercases for comparison).
    pub fn address_hex(&self) -> String {
        format!("0x{}", hex::encode(self.address))
    }
}

/// EVM address = last 20 bytes of keccak256(uncompressed_pubkey[1..]) — drop the
/// `0x04` SEC1 prefix, hash the 64-byte X||Y, take the low 20 bytes.
fn address_from_verifying_key(vk: &VerifyingKey) -> [u8; 20] {
    let encoded = vk.to_encoded_point(false); // uncompressed: 0x04 || X(32) || Y(32)
    let xy = &encoded.as_bytes()[1..]; // strip the 0x04 tag
    let hash = keccak256(xy);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..]);
    addr
}

fn keccak256(bytes: &[u8]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(bytes);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// Build the `verifyAndMintWork` calldata for one proof — byte-identical to
/// `cross_chain_mining.go::parseTriple`.
pub fn build_mint_calldata(
    work_proof: &[u8],
    pubkey: &[u8],
    signature: &[u8],
    chain_id: u64,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(
        4 + 4 + work_proof.len() + 4 + pubkey.len() + 4 + signature.len() + 8,
    );
    out.extend_from_slice(&SELECTOR_VERIFY_AND_MINT_WORK);
    for blob in [work_proof, pubkey, signature] {
        out.extend_from_slice(&(blob.len() as u32).to_be_bytes());
        out.extend_from_slice(blob);
    }
    out.extend_from_slice(&chain_id.to_be_bytes());
    out
}

/// EIP-1559 transaction fields. Numeric values are minimal big-endian byte
/// strings for RLP (leading zeros stripped; zero == empty).
struct Eip1559Tx {
    chain_id: u64,
    nonce: u64,
    max_priority_fee_per_gas: u128,
    max_fee_per_gas: u128,
    gas_limit: u64,
    to: [u8; 20],
    value: u128,
    data: Vec<u8>,
}

impl Eip1559Tx {
    /// RLP-encode the nine signing fields (access_list = empty list) without a
    /// signature, prefixed with the `0x02` type byte — the EIP-2718 payload
    /// whose keccak256 is the sighash.
    fn rlp_unsigned(&self) -> Vec<u8> {
        let mut s = RlpStream::new_list(9);
        s.append(&self.chain_id);
        append_u128(&mut s, self.nonce as u128);
        append_u128(&mut s, self.max_priority_fee_per_gas);
        append_u128(&mut s, self.max_fee_per_gas);
        s.append(&self.gas_limit);
        s.append(&self.to.as_slice());
        append_u128(&mut s, self.value);
        s.append(&self.data);
        s.begin_list(0); // empty access list
        prepend_type(s.out().to_vec())
    }

    /// RLP-encode all twelve fields (nine + y_parity, r, s) and prepend `0x02`.
    fn rlp_signed(&self, sig: &Signature, recovery: RecoveryId) -> Vec<u8> {
        let r = sig.r().to_bytes();
        let s_val = sig.s().to_bytes();
        let mut s = RlpStream::new_list(12);
        s.append(&self.chain_id);
        append_u128(&mut s, self.nonce as u128);
        append_u128(&mut s, self.max_priority_fee_per_gas);
        append_u128(&mut s, self.max_fee_per_gas);
        s.append(&self.gas_limit);
        s.append(&self.to.as_slice());
        append_u128(&mut s, self.value);
        s.append(&self.data);
        s.begin_list(0); // empty access list
        // y_parity is 0/1 for typed txs (NOT 27/28).
        s.append(&(recovery.to_byte() as u64));
        s.append(&trim_left(r.as_slice()));
        s.append(&trim_left(s_val.as_slice()));
        prepend_type(s.out().to_vec())
    }

    /// Sign: keccak256(0x02 || rlp(unsigned)) → recoverable secp256k1 sig →
    /// `0x02 || rlp(signed)`. Returns the raw tx bytes for
    /// `eth_sendRawTransaction`.
    fn sign(&self, key: &SigningKey) -> Result<Vec<u8>, MiningError> {
        let sighash = keccak256(&self.rlp_unsigned());
        let (sig, recovery) = key
            .sign_prehash_recoverable(&sighash)
            .map_err(|e| MiningError::Crypto(format!("secp256k1 sign: {e}")))?;
        Ok(self.rlp_signed(&sig, recovery))
    }
}

/// RLP-append a u128 as a minimal big-endian scalar (Ethereum integers are
/// unsigned, leading-zero-trimmed; 0 encodes as empty).
fn append_u128(s: &mut RlpStream, v: u128) {
    s.append(&trim_left(&v.to_be_bytes()).to_vec());
}

/// Strip leading zero bytes (Ethereum scalar encoding).
fn trim_left(bytes: &[u8]) -> &[u8] {
    let first = bytes.iter().position(|&b| b != 0).unwrap_or(bytes.len());
    &bytes[first..]
}

/// Prepend the EIP-2718 type byte to an RLP list payload.
fn prepend_type(mut rlp: Vec<u8>) -> Vec<u8> {
    let mut out = Vec::with_capacity(rlp.len() + 1);
    out.push(TX_TYPE_EIP1559);
    out.append(&mut rlp);
    out
}

// ---------------------------------------------------------------------------
// JSON-RPC over reqwest. One minimal client; no provider abstraction.
// ---------------------------------------------------------------------------

/// Thin JSON-RPC 2.0 client over the brand RPC URL.
struct RpcClient {
    http: reqwest::Client,
    url: String,
    id: std::sync::atomic::AtomicU64,
}

impl RpcClient {
    fn new(url: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            url,
            id: std::sync::atomic::AtomicU64::new(1),
        }
    }

    /// Issue a single JSON-RPC call and return the raw `result` value (or the
    /// JSON-RPC error message).
    async fn call(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, MiningError> {
        let id = self.id.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let resp = self
            .http
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .map_err(|e| MiningError::Precompile(format!("rpc {method} send: {e}")))?;
        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| MiningError::Precompile(format!("rpc {method} decode: {e}")))?;
        if let Some(err) = v.get("error") {
            return Err(MiningError::Precompile(format!("rpc {method}: {err}")));
        }
        Ok(v.get("result").cloned().unwrap_or(serde_json::Value::Null))
    }
}

/// Parse a `0x`-prefixed hex quantity into u128 (RPC returns minimal hex).
fn parse_hex_u128(v: &serde_json::Value) -> Result<u128, MiningError> {
    let s = v
        .as_str()
        .ok_or_else(|| MiningError::Precompile("expected hex string".into()))?;
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.is_empty() {
        return Ok(0);
    }
    u128::from_str_radix(s, 16)
        .map_err(|e| MiningError::Precompile(format!("hex parse '{s}': {e}")))
}

fn hex_quantity(v: u128) -> String {
    if v == 0 {
        "0x0".to_string()
    } else {
        format!("0x{:x}", v)
    }
}

/// 0x-prefixed full-byte hex (for tx params / addresses).
fn hex_data(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

/// Resolve nonce, fee caps, and chain id from the node, build + sign + send the
/// EIP-1559 mint tx, then poll for the receipt. Returns (tx_hash, block_number).
async fn submit_mint_tx(
    rpc: &RpcClient,
    wallet: &EvmWallet,
    chain_id: u64,
    calldata: Vec<u8>,
) -> Result<(String, u64), MiningError> {
    let from = hex_data(&wallet.address);

    // Pending nonce so back-to-back claims in one session don't collide.
    let nonce = parse_hex_u128(
        &rpc.call(
            "eth_getTransactionCount",
            serde_json::json!([from, "pending"]),
        )
        .await?,
    )? as u64;

    // Base fee from the latest block header; priority tip = 1 gwei; cap = 2*base + tip.
    let base_fee = match rpc
        .call(
            "eth_getBlockByNumber",
            serde_json::json!(["latest", false]),
        )
        .await?
        .get("baseFeePerGas")
    {
        Some(v) => parse_hex_u128(v)?,
        None => 0, // non-1559 chain: fall back to a flat 1 gwei via the caps below
    };
    let max_priority_fee_per_gas: u128 = 1_000_000_000; // 1 gwei tip
    let max_fee_per_gas = base_fee
        .saturating_mul(2)
        .saturating_add(max_priority_fee_per_gas)
        .max(max_priority_fee_per_gas);

    let tx = Eip1559Tx {
        chain_id,
        nonce,
        max_priority_fee_per_gas,
        max_fee_per_gas,
        gas_limit: CLAIM_GAS_LIMIT,
        to: AI_MINING_ADDR,
        value: 0,
        data: calldata,
    };
    let raw = tx.sign(&wallet.signing_key)?;

    let tx_hash = rpc
        .call(
            "eth_sendRawTransaction",
            serde_json::json!([hex_data(&raw)]),
        )
        .await?
        .as_str()
        .ok_or_else(|| MiningError::Precompile("sendRawTransaction: no hash".into()))?
        .to_string();

    // Poll for the receipt — ~60s budget (30 * 2s). A null result means still
    // pending; status 0x0 means the precompile reverted the mint.
    for _ in 0..30 {
        let receipt = rpc
            .call(
                "eth_getTransactionReceipt",
                serde_json::json!([tx_hash]),
            )
            .await?;
        if !receipt.is_null() {
            let status = receipt
                .get("status")
                .map(parse_hex_u128)
                .transpose()?
                .unwrap_or(0);
            if status != 1 {
                return Err(MiningError::Precompile(format!(
                    "mint tx {tx_hash} reverted (status {status})"
                )));
            }
            let block_number = receipt
                .get("blockNumber")
                .map(parse_hex_u128)
                .transpose()?
                .unwrap_or(0) as u64;
            return Ok((tx_hash, block_number));
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
    Err(MiningError::Precompile(format!(
        "mint tx {tx_hash} not mined within timeout"
    )))
}

/// Claim **all** `locally_verified` proofs for `wallet` against `chain_id` by
/// re-submitting each proof's `(workProof, pubkey, signature)` triple to the
/// precompile. On a successful (status-1) receipt the matching ProofRecord is
/// flipped `locally_verified` → `claimed`, which `sum_pending` already excludes,
/// so the UI's pending balance drops to the still-unclaimed remainder.
///
/// `rpc_url` / `chain_id` come from the active brand (`brand-config`'s
/// `network.rpc` / `network.chainId`). `proof_signing` re-creates the exact
/// proof bytes + ML-DSA signature for each record — Phase 1 only persists the
/// reward + work-id digest, not the full triple, so the live mining loop must
/// hand the claim path the same `NextProof` data (see "Wiring" in the module
/// docs). This function takes the already-reconstructed triples.
#[allow(clippy::too_many_arguments)]
pub async fn claim_all(
    storage_dir: &PathBuf,
    wallet_phrase: &str,
    rpc_url: &str,
    chain_id: u64,
    triples: &[ClaimTriple],
) -> Result<ClaimReceipt, MiningError> {
    let wallet = EvmWallet::from_mnemonic(wallet_phrase)?;
    let wallet_addr = wallet.address_hex();
    let rpc = RpcClient::new(rpc_url.to_string());

    let mut history = read_history(storage_dir, &wallet_addr).unwrap_or_default();
    let mut claimed_count = 0usize;
    let mut claimed_wei: u128 = 0;
    let mut last_tx = String::new();
    let mut last_block = 0u64;

    for triple in triples {
        // Only settle records still marked locally_verified.
        let Some(idx) = history.iter().position(|r| {
            r.work_id_hex == triple.work_id_hex && r.status == "locally_verified"
        }) else {
            continue;
        };
        let calldata = build_mint_calldata(
            &triple.work_proof,
            &triple.pubkey,
            &triple.signature,
            chain_id,
        );
        let (tx_hash, block) = submit_mint_tx(&rpc, &wallet, chain_id, calldata).await?;

        history[idx].status = "claimed".to_string();
        claimed_count += 1;
        claimed_wei = claimed_wei
            .saturating_add(history[idx].reward_wei.parse::<u128>().unwrap_or(0));
        last_tx = tx_hash;
        last_block = block;
        // Persist after each success so a mid-batch failure never double-claims.
        write_history(storage_dir, &wallet_addr, &history)?;
    }

    // Recompute pending for the caller's convenience (UI re-reads anyway).
    let _ = sum_pending(&history);

    Ok(ClaimReceipt {
        tx_hash: last_tx,
        block_number: last_block,
        claimed_count,
        claimed_wei: claimed_wei.to_string(),
        from: wallet_addr,
    })
}

/// The on-chain-bound data for one proof: the record's work-id (to match
/// history) plus the exact `(workProof, pubkey, signature)` the precompile
/// re-verifies. Produced by the mining loop / backend (`NextProof`), carried
/// here so the claim never re-derives crypto it can't reproduce.
#[derive(Debug, Clone)]
pub struct ClaimTriple {
    pub work_id_hex: String,
    pub work_proof: Vec<u8>,
    pub pubkey: Vec<u8>,
    pub signature: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Known BIP-39 test vector → known Ethereum address (the canonical
    // "test test ... junk" dev mnemonic, account 0). Proves
    // mnemonic→BIP44→secp256k1→keccak address derivation matches ethers.js.
    const DEV_MNEMONIC: &str =
        "test test test test test test test test test test test junk";
    const DEV_ADDR_0: &str = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

    #[test]
    fn derives_canonical_eth_address_from_mnemonic() {
        let w = EvmWallet::from_mnemonic(DEV_MNEMONIC).expect("derive");
        assert_eq!(w.address_hex(), DEV_ADDR_0);
    }

    #[test]
    fn calldata_matches_parse_triple_layout() {
        let work = vec![0xAAu8; 78];
        let pk = vec![0xBBu8; 1952];
        let sig = vec![0xCCu8; 3309];
        let chain_id: u64 = 36900;
        let cd = build_mint_calldata(&work, &pk, &sig, chain_id);

        // selector
        assert_eq!(&cd[0..4], &SELECTOR_VERIFY_AND_MINT_WORK);
        let mut off = 4;
        // blob A: workProof
        assert_eq!(&cd[off..off + 4], &(78u32).to_be_bytes());
        off += 4;
        assert_eq!(&cd[off..off + 78], &work[..]);
        off += 78;
        // blob B: pubkey
        assert_eq!(&cd[off..off + 4], &(1952u32).to_be_bytes());
        off += 4 + 1952;
        // blob C: signature
        assert_eq!(&cd[off..off + 4], &(3309u32).to_be_bytes());
        off += 4 + 3309;
        // trailing chainId
        assert_eq!(&cd[off..off + 8], &chain_id.to_be_bytes());
        assert_eq!(cd.len(), off + 8);
    }

    #[test]
    fn signed_tx_is_typed_eip1559_and_recovers_to_signer() {
        let w = EvmWallet::from_mnemonic(DEV_MNEMONIC).expect("derive");
        let tx = Eip1559Tx {
            chain_id: 36900,
            nonce: 7,
            max_priority_fee_per_gas: 1_000_000_000,
            max_fee_per_gas: 3_000_000_000,
            gas_limit: CLAIM_GAS_LIMIT,
            to: AI_MINING_ADDR,
            value: 0,
            data: build_mint_calldata(&[0u8; 78], &[1u8; 1952], &[2u8; 3309], 36900),
        };
        let raw = tx.sign(&w.signing_key).expect("sign");
        // Typed tx: first byte is the 0x02 envelope.
        assert_eq!(raw[0], TX_TYPE_EIP1559);

        // Recover the signer from the sighash and assert it equals our address.
        let sighash = keccak256(&tx.rlp_unsigned());
        let (sig, rec) = w
            .signing_key
            .sign_prehash_recoverable(&sighash)
            .expect("sign2");
        let recovered = VerifyingKey::recover_from_prehash(&sighash, &sig, rec).expect("recover");
        assert_eq!(address_from_verifying_key(&recovered), w.address);
    }

    #[test]
    fn trim_left_strips_zeros_and_keeps_zero_empty() {
        assert_eq!(trim_left(&[0, 0, 0x12, 0x34]), &[0x12, 0x34]);
        assert!(trim_left(&[0, 0, 0]).is_empty());
        assert_eq!(trim_left(&[0xff]), &[0xff]);
    }
}
