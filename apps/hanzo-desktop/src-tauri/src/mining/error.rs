// SPDX-License-Identifier: Apache-2.0
//! Mining error types — one place for every fallible mining operation.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MiningError {
    #[error("invalid work proof: layout/length mismatch")]
    InvalidProof,

    #[error("crypto: {0}")]
    Crypto(String),

    #[error("precompile: {0}")]
    Precompile(String),

    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
}
