//! Types for the embedded engine

use serde::{Deserialize, Serialize};

/// Model format detection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelFormat {
    /// GGUF format (pre-quantized, single file)
    Gguf,
    /// HuggingFace safetensors (with ISQ quantization)
    Safetensors,
    /// MLX-style prequantized models (from mlx-community)
    MlxQuantized,
    /// UQFF (Universal Quantized File Format)
    Uqff,
    /// Unknown format - auto-detect
    Auto,
}

impl Default for ModelFormat {
    fn default() -> Self {
        Self::Auto
    }
}

impl ModelFormat {
    /// Detect model format from model ID or path
    pub fn detect(model_id: &str) -> Self {
        let lower = model_id.to_lowercase();

        // GGUF files
        if lower.ends_with(".gguf") || lower.contains("/gguf/") || lower.contains("-gguf") {
            return Self::Gguf;
        }

        // UQFF files
        if lower.ends_with(".uqff") || lower.contains("uqff") {
            return Self::Uqff;
        }

        // MLX community models
        if lower.starts_with("mlx-community/") || lower.contains("-mlx") || lower.contains("/mlx-") {
            return Self::MlxQuantized;
        }

        // Default to safetensors for HuggingFace repos
        if lower.contains('/') && !lower.starts_with('/') {
            return Self::Safetensors;
        }

        // Local paths - check extension or default to auto
        Self::Auto
    }
}

/// Model loading options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadModelOptions {
    /// Model identifier (HuggingFace repo or local path)
    pub model_id: String,
    /// Optional specific revision/branch
    pub revision: Option<String>,
    /// Model format (auto-detected if not specified)
    #[serde(default)]
    pub format: ModelFormat,
    /// Quantization type (e.g., "Q4_K", "AFQ4", "Q8_0")
    /// For Metal: AFQ2, AFQ3, AFQ4, AFQ6, AFQ8 (optimized)
    /// For CUDA/CPU: Q4_0, Q4_K, Q5_K, Q6_K, Q8_0, Q8_K
    pub quantization: Option<String>,
    /// Use in-situ quantization (ISQ) - quantize on load
    pub use_isq: Option<bool>,
    /// Maximum sequence length
    pub max_seq_len: Option<usize>,
    /// Enable paged attention (reduces memory for long contexts)
    pub paged_attention: Option<bool>,
    /// Device preference: "auto", "metal", "cuda", "cpu"
    pub device: Option<String>,
    /// Token files for chat template (optional)
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
            paged_attention: Some(true),
            device: Some("auto".to_string()),
            tokenizer_json: None,
        }
    }
}

/// Chat message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

/// Chat request options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatOptions {
    /// Temperature for sampling (0.0-2.0)
    pub temperature: Option<f64>,
    /// Top-p (nucleus) sampling
    pub top_p: Option<f64>,
    /// Top-k sampling
    pub top_k: Option<usize>,
    /// Maximum tokens to generate
    pub max_tokens: Option<usize>,
    /// Stop sequences
    pub stop: Option<Vec<String>>,
    /// Frequency penalty
    pub frequency_penalty: Option<f32>,
    /// Presence penalty
    pub presence_penalty: Option<f32>,
}

impl Default for ChatOptions {
    fn default() -> Self {
        Self {
            temperature: Some(0.7),
            top_p: Some(0.9),
            top_k: None,
            max_tokens: Some(2048),
            stop: None,
            frequency_penalty: None,
            presence_penalty: None,
        }
    }
}

/// Engine status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus {
    /// Whether the engine is initialized
    pub initialized: bool,
    /// Currently loaded model (if any)
    pub loaded_model: Option<String>,
    /// Device being used
    pub device: String,
    /// Memory usage in bytes
    pub memory_usage: Option<u64>,
    /// Whether engine is currently processing
    pub is_busy: bool,
}

/// Chat completion response (non-streaming)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: UsageStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoice {
    pub index: usize,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
    pub prompt_tokens_per_sec: Option<f64>,
    pub completion_tokens_per_sec: Option<f64>,
}

/// Streaming chunk event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub id: String,
    pub delta: String,
    pub finish_reason: Option<String>,
}

/// Embedding request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRequest {
    pub input: Vec<String>,
    pub model: Option<String>,
}

/// Embedding response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub model: String,
    pub data: Vec<EmbeddingData>,
    pub usage: EmbeddingUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingData {
    pub index: usize,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingUsage {
    pub prompt_tokens: usize,
    pub total_tokens: usize,
}

/// Available model info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub size_bytes: Option<u64>,
    pub quantization: Option<String>,
    pub architecture: Option<String>,
}
