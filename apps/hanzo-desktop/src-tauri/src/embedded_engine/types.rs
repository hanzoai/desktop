//! Types for the embedded engine.
//!
//! Scope is deliberately small: only what the desktop's load/unload/status
//! surface needs. Chat / embedding / streaming request+response shapes used to
//! live here to feed a hand-rolled OpenAI server; that server is gone, so those
//! types are too. The OpenAI/Anthropic wire types now come from the canonical
//! `hanzo-server-core` router.

use serde::{Deserialize, Serialize};

/// Model format detection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelFormat {
    /// GGUF format (pre-quantized, single file).
    Gguf,
    /// HuggingFace safetensors (with ISQ quantization).
    Safetensors,
    /// MLX-style prequantized models (from mlx-community).
    MlxQuantized,
    /// UQFF (Universal Quantized File Format).
    Uqff,
    /// Unknown format - auto-detect.
    Auto,
}

impl Default for ModelFormat {
    fn default() -> Self {
        Self::Auto
    }
}

impl ModelFormat {
    /// Detect model format from model ID or path.
    pub fn detect(model_id: &str) -> Self {
        let lower = model_id.to_lowercase();

        if lower.ends_with(".gguf") || lower.contains("/gguf/") || lower.contains("-gguf") {
            return Self::Gguf;
        }
        if lower.ends_with(".uqff") || lower.contains("uqff") {
            return Self::Uqff;
        }
        if lower.starts_with("mlx-community/") || lower.contains("-mlx") || lower.contains("/mlx-") {
            return Self::MlxQuantized;
        }
        if lower.contains('/') && !lower.starts_with('/') {
            return Self::Safetensors;
        }
        Self::Auto
    }
}

/// Model loading options (IPC + `/v1/engine/load` payload).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadModelOptions {
    /// Model identifier (HuggingFace repo or local path).
    pub model_id: String,
    /// Optional specific revision/branch.
    pub revision: Option<String>,
    /// Model format (auto-detected if not specified).
    #[serde(default)]
    pub format: ModelFormat,
    /// Quantization type for ISQ (e.g., "Q4_K", "Q8_0"). Ignored for GGUF/UQFF.
    pub quantization: Option<String>,
    /// Use in-situ quantization (ISQ) - quantize on load (non-GGUF formats).
    pub use_isq: Option<bool>,
    /// Maximum sequence length.
    pub max_seq_len: Option<usize>,
    /// Enable paged attention. `None` = device default (CUDA on, Metal off).
    pub paged_attention: Option<bool>,
    /// Device preference: "auto", "metal", "cuda", "cpu".
    pub device: Option<String>,
    /// Token files for chat template (optional).
    pub tokenizer_json: Option<String>,
}

impl Default for LoadModelOptions {
    fn default() -> Self {
        Self {
            model_id: String::new(),
            revision: None,
            format: ModelFormat::Auto,
            quantization: Some("Q4_K".to_string()),
            use_isq: Some(true),
            max_seq_len: None,
            paged_attention: None,
            device: Some("auto".to_string()),
            tokenizer_json: None,
        }
    }
}

/// Engine status (IPC + `/v1/engine/status`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus {
    /// Whether a model is loaded and the canonical server is serving.
    pub initialized: bool,
    /// Currently loaded model (if any).
    pub loaded_model: Option<String>,
    /// Device being used.
    pub device: String,
    /// Memory usage in bytes (not yet reported).
    pub memory_usage: Option<u64>,
    /// Whether the engine is currently processing.
    pub is_busy: bool,
}
