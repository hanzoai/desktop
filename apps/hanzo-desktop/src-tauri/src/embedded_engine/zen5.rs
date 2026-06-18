//! Zen model catalog + defaults for the embedded engine.
//!
//! IDs are verified against the live HF org (hf.co/zenlm). The desktop defaults
//! to the small local tiers:
//!   - chat:      `zenlm/zen-nano-0.6b`     (0.6B dense, edge-class)
//!   - embedding: `zenlm/zen-embedding-0.6B` (small; GGUF available for local)
//!
//! The flagship is `zenlm/zen-5` — a Qwen3.5-based "Mixture of Diverse Experts"
//! (MoDE), NOT "Qwen3.6". Large checkpoints (run a GGUF/small tier locally or
//! point at a remote server). The engine's Qwen3 / Qwen3-MoE / Qwen3-Next
//! loaders cover these architectures; GGUF tiers load directly.

use serde::Serialize;

/// Default local chat model (small, edge-class).
pub const ZEN_DEFAULT_CHAT_MODEL: &str = "zenlm/zen-nano-0.6b";
/// Default embedding model (small; has a GGUF for local use).
pub const ZEN_DEFAULT_EMBEDDING_MODEL: &str = "zenlm/zen-embedding-0.6B";
/// Flagship model id.
pub const ZEN_FLAGSHIP_MODEL: &str = "zenlm/zen-5";

/// A model's role.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ZenModelKind {
    Chat,
    Embedding,
}

/// A selectable Zen model for the embedded engine.
#[derive(Debug, Clone, Serialize)]
pub struct ZenModel {
    /// Short id / OpenAI `model` field.
    pub id: &'static str,
    /// HuggingFace repo (safetensors) the engine loads from.
    pub hf_repo: &'static str,
    /// Prequantized GGUF repo for fast local loading, if published.
    pub gguf_repo: Option<&'static str>,
    /// Human-readable label.
    pub name: &'static str,
    /// Chat vs embedding.
    pub kind: ZenModelKind,
    /// Param tier (display / loader hint).
    pub size: &'static str,
    /// One-line description.
    pub description: &'static str,
    /// Realistically runnable on a typical laptop today.
    pub local_runnable: bool,
    /// The default pick for its kind.
    pub is_default: bool,
}

/// The Zen catalog (HF repo ids verified against hf.co/zenlm).
pub const ZEN_MODELS: &[ZenModel] = &[
    // --- Chat ---
    ZenModel {
        id: "zen-nano-0.6b",
        hf_repo: "zenlm/zen-nano-0.6b",
        gguf_repo: None,
        name: "Zen Nano 0.6B",
        kind: ZenModelKind::Chat,
        size: "0.6B",
        description: "Ultra-light edge LLM. Default local chat model.",
        local_runnable: true,
        is_default: true,
    },
    ZenModel {
        id: "zen-5-nano-2b",
        hf_repo: "zenlm/zen-5-nano-2B-gguf",
        gguf_repo: Some("zenlm/zen-5-nano-2B-gguf"),
        name: "Zen5 Nano 2B",
        kind: ZenModelKind::Chat,
        size: "2B",
        description: "Small prequantized GGUF tier; great speed/quality on laptops.",
        local_runnable: true,
        is_default: false,
    },
    ZenModel {
        id: "zen-eco-4b",
        hf_repo: "zenlm/zen-eco-4b-instruct",
        gguf_repo: None,
        name: "Zen Eco 4B",
        kind: ZenModelKind::Chat,
        size: "4B",
        description: "Efficient general-purpose model for capable machines.",
        local_runnable: true,
        is_default: false,
    },
    ZenModel {
        id: "zen-5",
        hf_repo: "zenlm/zen-5",
        gguf_repo: Some("zenlm/zen-5-gguf"),
        name: "Zen5 (flagship)",
        kind: ZenModelKind::Chat,
        size: "MoDE",
        description: "Mixture-of-Diverse-Experts flagship (Qwen3.5-based).",
        local_runnable: false,
        is_default: false,
    },
    ZenModel {
        id: "zen-5-coder",
        hf_repo: "zenlm/zen-5-coder",
        gguf_repo: Some("zenlm/zen-5-coder-gguf"),
        name: "Zen5 Coder",
        kind: ZenModelKind::Chat,
        size: "MoDE",
        description: "Code-specialized MoDE.",
        local_runnable: false,
        is_default: false,
    },
    // --- Embedding ---
    ZenModel {
        id: "zen-embedding-0.6b",
        hf_repo: "zenlm/zen-embedding-0.6B",
        gguf_repo: Some("zenlm/zen-embedding-0.6B-GGUF"),
        name: "Zen Embedding 0.6B",
        kind: ZenModelKind::Embedding,
        size: "0.6B",
        description: "Small text-embedding model. Default; GGUF for local/edge.",
        local_runnable: true,
        is_default: true,
    },
    ZenModel {
        id: "zen-embedding-4b",
        hf_repo: "zenlm/zen-embedding-4B",
        gguf_repo: None,
        name: "Zen Embedding 4B",
        kind: ZenModelKind::Embedding,
        size: "4B",
        description: "Higher-quality embeddings for RAG/search.",
        local_runnable: true,
        is_default: false,
    },
    ZenModel {
        id: "zen-embedding-8b",
        hf_repo: "zenlm/zen-embedding-8B",
        gguf_repo: Some("zenlm/zen-embedding-8B-GGUF"),
        name: "Zen Embedding 8B",
        kind: ZenModelKind::Embedding,
        size: "8B",
        description: "Top-quality embeddings; GGUF available.",
        local_runnable: false,
        is_default: false,
    },
];

/// List the Zen catalog for the model picker.
#[tauri::command]
pub fn engine_list_zen5_models() -> Vec<ZenModel> {
    ZEN_MODELS.to_vec()
}
