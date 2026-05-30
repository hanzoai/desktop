//! Zen model catalog + defaults for the embedded engine.
//!
//! The desktop defaults to ZenLM models on HuggingFace. For on-device use the
//! defaults are the small tiers:
//!   - chat:      `zenlm/zen-nano-0.6b`        (0.6B dense, 32K ctx, ~0.4-1.2GB)
//!   - embedding: `zenlm/zen3-embedding-small` (0.6B, 32K ctx)
//!
//! The flagship is `zenlm/zen5` — a Qwen3.5-based "Mixture of Diverse Experts"
//! (MoDE), NOT "Qwen3.6": dense tiers `Qwen/Qwen3.5-0.8B`/`-9B` (Gated DeltaNet)
//! plus frozen experts harvested from GLM-5, Kimi K2.5, MiniMax, Ling. The
//! published Zen5 checkpoints are large (750B-3.1T total); run a small tier
//! locally or point the engine at a remote server. The engine's Qwen3 /
//! Qwen3-MoE / Qwen3-Next loaders cover these architectures.

use serde::Serialize;

/// Default local chat model (small, edge-class).
pub const ZEN_DEFAULT_CHAT_MODEL: &str = "zenlm/zen-nano-0.6b";
/// Default local embedding model (the very small one).
pub const ZEN_DEFAULT_EMBEDDING_MODEL: &str = "zenlm/zen3-embedding-small";
/// Flagship model id.
pub const ZEN_FLAGSHIP_MODEL: &str = "zenlm/zen5";

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
    /// HuggingFace repo the engine loads from.
    pub hf_repo: &'static str,
    /// Human-readable label.
    pub name: &'static str,
    /// Chat vs embedding.
    pub kind: ZenModelKind,
    /// Base architecture (display / loader hint).
    pub base: &'static str,
    /// One-line description.
    pub description: &'static str,
    /// Realistically runnable on a typical laptop today.
    pub local_runnable: bool,
    /// The default pick for its kind.
    pub is_default: bool,
}

/// The Zen catalog (HF repo ids from zenlm/models).
pub const ZEN_MODELS: &[ZenModel] = &[
    ZenModel {
        id: "zen-nano-0.6b",
        hf_repo: "zenlm/zen-nano-0.6b",
        name: "Zen Nano 0.6B",
        kind: ZenModelKind::Chat,
        base: "Dense 0.6B",
        description: "Ultra-light edge LLM, 32K context. Default local chat model.",
        local_runnable: true,
        is_default: true,
    },
    ZenModel {
        id: "zen-eco-4b",
        hf_repo: "zenlm/zen-eco-4b",
        name: "Zen Eco 4B",
        kind: ZenModelKind::Chat,
        base: "Dense 4B",
        description: "Efficient general-purpose model; runs on most laptops.",
        local_runnable: true,
        is_default: false,
    },
    ZenModel {
        id: "zen-8b",
        hf_repo: "zenlm/zen-8b",
        name: "Zen 8B",
        kind: ZenModelKind::Chat,
        base: "Dense 8B",
        description: "Higher-quality dense model for capable machines.",
        local_runnable: true,
        is_default: false,
    },
    ZenModel {
        id: "zen5",
        hf_repo: "zenlm/zen5",
        name: "Zen5 (flagship)",
        kind: ZenModelKind::Chat,
        base: "Qwen3.5 MoDE",
        description: "Mixture-of-Diverse-Experts flagship (750B total / 0.8-50B active).",
        local_runnable: false,
        is_default: false,
    },
    ZenModel {
        id: "zen5-coder",
        hf_repo: "zenlm/zen5-coder",
        name: "Zen5 Coder",
        kind: ZenModelKind::Chat,
        base: "Qwen3.5 MoDE",
        description: "Code-specialized MoDE (1.8T total).",
        local_runnable: false,
        is_default: false,
    },
    ZenModel {
        id: "zen3-embedding-small",
        hf_repo: "zenlm/zen3-embedding-small",
        name: "Zen3 Embedding Small",
        kind: ZenModelKind::Embedding,
        base: "Embedding 0.6B",
        description: "Lightweight embeddings, 32K context. Default local embedding model.",
        local_runnable: true,
        is_default: true,
    },
    ZenModel {
        id: "zen3-embedding-medium",
        hf_repo: "zenlm/zen3-embedding-medium",
        name: "Zen3 Embedding Medium",
        kind: ZenModelKind::Embedding,
        base: "Embedding",
        description: "Higher-quality embeddings for RAG/search.",
        local_runnable: true,
        is_default: false,
    },
];

/// List the Zen catalog for the model picker.
#[tauri::command]
pub fn engine_list_zen5_models() -> Vec<ZenModel> {
    ZEN_MODELS.to_vec()
}
