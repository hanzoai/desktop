//! Core Hanzo Engine implementation - High-performance AI inference
//!
//! Supports multiple model formats:
//! - GGUF: Pre-quantized single-file models
//! - Safetensors: HuggingFace format with ISQ (in-situ quantization)
//! - MLX: Apple MLX prequantized models (mlx-community)
//! - UQFF: Universal Quantized File Format

use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::{Result, anyhow};

// Backed by the native Hanzo Engine fork: `hanzo` is the high-level SDK,
// `hanzo_engine` is the core (formerly mistralrs / mistralrs-core).
use hanzo::{
    GgufModelBuilder, TextModelBuilder, TextMessages, TextMessageRole,
    Model, IsqType, PagedAttentionMetaBuilder, Response,
};
use hanzo_engine::{ChatCompletionChunkResponse, ChunkChoice, Delta};

use super::types::*;

/// The embedded inference engine
pub struct EmbeddedEngine {
    /// The loaded model (if any)
    model: Option<Arc<Model>>,
    /// Current model identifier
    model_id: Option<String>,
    /// Current model format
    model_format: Option<ModelFormat>,
    /// Device being used
    device: String,
    /// Whether currently processing a request
    is_busy: Arc<RwLock<bool>>,
}

impl EmbeddedEngine {
    /// Create a new embedded engine
    pub fn new() -> Self {
        // Detect best device
        let device = Self::detect_device();

        Self {
            model: None,
            model_id: None,
            model_format: None,
            device,
            is_busy: Arc::new(RwLock::new(false)),
        }
    }

    /// Detect the best available device
    #[allow(unreachable_code)] // the cpu fallback is unreachable once a gpu backend is enabled
    fn detect_device() -> String {
        #[cfg(all(target_os = "macos", feature = "metal"))]
        {
            return "metal".to_string();
        }

        #[cfg(feature = "cuda")]
        {
            return "cuda".to_string();
        }

        "cpu".to_string()
    }

    /// Get engine status
    pub async fn get_status(&self) -> EngineStatus {
        let is_busy = *self.is_busy.read().await;

        EngineStatus {
            initialized: self.model.is_some(),
            loaded_model: self.model_id.clone(),
            device: self.device.clone(),
            memory_usage: None, // TODO: Get from sysinfo
            is_busy,
        }
    }

    /// Load a model with automatic format detection
    pub async fn load_model(&mut self, options: LoadModelOptions) -> Result<()> {
        // Detect format if auto
        let format = match options.format {
            ModelFormat::Auto => ModelFormat::detect(&options.model_id),
            f => f,
        };

        log::info!("Loading model: {} (format: {:?})", options.model_id, format);

        match format {
            ModelFormat::Gguf => self.load_gguf_model(options).await,
            ModelFormat::Safetensors => self.load_hf_model(options).await,
            ModelFormat::MlxQuantized => self.load_mlx_model(options).await,
            ModelFormat::Uqff => self.load_uqff_model(options).await,
            ModelFormat::Auto => {
                // Try safetensors by default for auto-detection failures
                self.load_hf_model(options).await
            }
        }
    }

    /// Load a GGUF model
    /// Note: GGUF models are already quantized, so no ISQ is applied
    pub async fn load_gguf_model(&mut self, options: LoadModelOptions) -> Result<()> {
        log::info!("Loading GGUF model: {}", options.model_id);

        // Unload existing model first
        self.unload_model().await?;

        let mut builder = GgufModelBuilder::new(
            options.model_id.clone(),
            vec![options.model_id.clone()], // GGUF files
        );

        // Enable paged attention if requested. hanzo-engine takes a built
        // PagedAttentionConfig by value (no-op on backends without PA support).
        if options.paged_attention.unwrap_or(true) {
            builder = builder.with_paged_attn(PagedAttentionMetaBuilder::default().build()?);
        }

        // Enable logging
        builder = builder.with_logging();

        // Build the model
        let model = builder.build().await?;

        self.model = Some(Arc::new(model));
        self.model_id = Some(options.model_id);
        self.model_format = Some(ModelFormat::Gguf);

        log::info!("GGUF model loaded successfully");
        Ok(())
    }

    /// Load a HuggingFace model (safetensors format)
    pub async fn load_hf_model(&mut self, options: LoadModelOptions) -> Result<()> {
        log::info!("Loading HuggingFace model: {}", options.model_id);

        // Unload existing model first
        self.unload_model().await?;

        let mut builder = TextModelBuilder::new(options.model_id.clone());

        // Apply ISQ (In-Situ Quantization) - quantizes on load to reduce memory
        if options.use_isq.unwrap_or(true) {
            let isq_type = self.parse_isq_type(options.quantization.as_deref().unwrap_or("Q4_K"));
            builder = builder.with_isq(isq_type);
        }

        // Enable paged attention if requested. hanzo-engine takes a built
        // PagedAttentionConfig by value (no-op on backends without PA support).
        if options.paged_attention.unwrap_or(true) {
            builder = builder.with_paged_attn(PagedAttentionMetaBuilder::default().build()?);
        }

        // Enable logging
        builder = builder.with_logging();

        // Build the model
        let model = builder.build().await?;

        self.model = Some(Arc::new(model));
        self.model_id = Some(options.model_id);
        self.model_format = Some(ModelFormat::Safetensors);

        log::info!("HuggingFace model loaded successfully");
        Ok(())
    }

    /// Load an MLX-style prequantized model (from mlx-community)
    /// These models are already quantized with AFQ and optimized for Metal
    pub async fn load_mlx_model(&mut self, options: LoadModelOptions) -> Result<()> {
        log::info!("Loading MLX prequantized model: {}", options.model_id);

        // Unload existing model first
        self.unload_model().await?;

        // MLX models are loaded the same way as HF models
        // The engine auto-detects the quantization config from quantization_config.json
        let mut builder = TextModelBuilder::new(options.model_id.clone());

        // Don't apply additional ISQ - MLX models are already quantized
        // builder = builder.with_isq(...) - skipped for MLX

        // Enable paged attention if requested. hanzo-engine takes a built
        // PagedAttentionConfig by value (no-op on backends without PA support).
        if options.paged_attention.unwrap_or(true) {
            builder = builder.with_paged_attn(PagedAttentionMetaBuilder::default().build()?);
        }

        // Enable logging
        builder = builder.with_logging();

        // Build the model
        let model = builder.build().await?;

        self.model = Some(Arc::new(model));
        self.model_id = Some(options.model_id);
        self.model_format = Some(ModelFormat::MlxQuantized);

        log::info!("MLX model loaded successfully");
        Ok(())
    }

    /// Load a UQFF (Universal Quantized File Format) model
    pub async fn load_uqff_model(&mut self, options: LoadModelOptions) -> Result<()> {
        log::info!("Loading UQFF model: {}", options.model_id);

        // Unload existing model first
        self.unload_model().await?;

        // UQFF models use the same TextModelBuilder
        // The engine auto-detects UQFF format from file extension/metadata
        let mut builder = TextModelBuilder::new(options.model_id.clone());

        // Enable paged attention if requested. hanzo-engine takes a built
        // PagedAttentionConfig by value (no-op on backends without PA support).
        if options.paged_attention.unwrap_or(true) {
            builder = builder.with_paged_attn(PagedAttentionMetaBuilder::default().build()?);
        }

        // Enable logging
        builder = builder.with_logging();

        // Build the model
        let model = builder.build().await?;

        self.model = Some(Arc::new(model));
        self.model_id = Some(options.model_id);
        self.model_format = Some(ModelFormat::Uqff);

        log::info!("UQFF model loaded successfully");
        Ok(())
    }

    /// Parse ISQ type from string
    /// Supports both standard Q types and AFQ types for Metal
    fn parse_isq_type(&self, quantization: &str) -> IsqType {
        match quantization.to_uppercase().as_str() {
            // Standard Q types (work on all backends)
            "Q4_0" => IsqType::Q4_0,
            "Q4_1" => IsqType::Q4_1,
            "Q4_K_M" | "Q4_K" | "Q4K" => IsqType::Q4K,
            "Q5_0" => IsqType::Q5_0,
            "Q5_1" => IsqType::Q5_1,
            "Q5_K_M" | "Q5_K" | "Q5K" => IsqType::Q5K,
            "Q6_K" | "Q6K" => IsqType::Q6K,
            "Q8_0" => IsqType::Q8_0,
            "Q8_1" => IsqType::Q8_1,
            "Q8_K" | "Q8K" => IsqType::Q8K,

            // AFQ types (optimized for Metal/Apple Silicon)
            // These are selected automatically on Metal when using integer values
            "2" | "AFQ2" => {
                #[cfg(feature = "metal")]
                { IsqType::Q4_0 } // AFQ2 falls back to Q4_0 in ISQ enum
                #[cfg(not(feature = "metal"))]
                { IsqType::Q4_0 }
            }
            "3" | "AFQ3" => {
                #[cfg(feature = "metal")]
                { IsqType::Q4_0 }
                #[cfg(not(feature = "metal"))]
                { IsqType::Q4_0 }
            }
            "4" | "AFQ4" => IsqType::Q4K,
            "5" => IsqType::Q5K,
            "6" | "AFQ6" => IsqType::Q6K,
            "8" | "AFQ8" => IsqType::Q8K,

            // Default to Q4_K for good balance of speed/quality
            _ => {
                log::warn!("Unknown quantization type '{}', using Q4_K", quantization);
                IsqType::Q4K
            }
        }
    }

    /// Unload the current model
    pub async fn unload_model(&mut self) -> Result<()> {
        if self.model.is_some() {
            log::info!("Unloading model");
            self.model = None;
            self.model_id = None;
            self.model_format = None;
        }
        Ok(())
    }

    /// Send a chat completion request (non-streaming)
    pub async fn chat(&self, messages: Vec<ChatMessage>, _options: ChatOptions) -> Result<ChatCompletionResponse> {
        let model = self.model.as_ref()
            .ok_or_else(|| anyhow!("No model loaded"))?;

        // Convert messages to TextMessages
        let mut text_messages = TextMessages::new();
        for msg in &messages {
            let role = match msg.role.as_str() {
                "system" => TextMessageRole::System,
                "user" => TextMessageRole::User,
                "assistant" => TextMessageRole::Assistant,
                _ => TextMessageRole::User,
            };
            text_messages = text_messages.add_message(role, &msg.content);
        }

        // Send request
        let response = model.send_chat_request(text_messages).await?;

        // Convert response
        let choice = response.choices.first()
            .ok_or_else(|| anyhow!("No response choices"))?;

        Ok(ChatCompletionResponse {
            id: response.id,
            model: response.model,
            choices: vec![ChatChoice {
                index: 0,
                message: ChatMessage {
                    role: "assistant".to_string(),
                    content: choice.message.content.clone().unwrap_or_default(),
                },
                finish_reason: Some(choice.finish_reason.clone()),
            }],
            usage: UsageStats {
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
                prompt_tokens_per_sec: Some(response.usage.avg_prompt_tok_per_sec as f64),
                completion_tokens_per_sec: Some(response.usage.avg_compl_tok_per_sec as f64),
            },
        })
    }

    /// Stream chat completion, returning chunks via callback
    pub async fn stream_chat<F>(&self, messages: Vec<ChatMessage>, _options: ChatOptions, mut on_chunk: F) -> Result<()>
    where
        F: FnMut(StreamChunk) + Send,
    {
        let model = self.model.as_ref()
            .ok_or_else(|| anyhow!("No model loaded"))?;

        // Convert messages to TextMessages
        let mut text_messages = TextMessages::new();
        for msg in &messages {
            let role = match msg.role.as_str() {
                "system" => TextMessageRole::System,
                "user" => TextMessageRole::User,
                "assistant" => TextMessageRole::Assistant,
                _ => TextMessageRole::User,
            };
            text_messages = text_messages.add_message(role, &msg.content);
        }

        // Stream request
        let mut stream = model.stream_chat_request(text_messages).await?;
        let request_id = uuid::Uuid::new_v4().to_string();

        while let Some(chunk) = stream.next().await {
            if let Response::Chunk(ChatCompletionChunkResponse { choices, .. }) = chunk {
                if let Some(ChunkChoice { delta: Delta { content, .. }, finish_reason, .. }) = choices.first() {
                    on_chunk(StreamChunk {
                        id: request_id.clone(),
                        delta: content.clone().unwrap_or_default(),
                        finish_reason: finish_reason.clone(),
                    });
                }
            }
        }

        Ok(())
    }

    /// Check if a model is loaded
    pub fn is_model_loaded(&self) -> bool {
        self.model.is_some()
    }

    /// Get the current model ID
    pub fn get_model_id(&self) -> Option<&str> {
        self.model_id.as_deref()
    }

    /// Get the current model format
    pub fn get_model_format(&self) -> Option<ModelFormat> {
        self.model_format
    }
}

impl Default for EmbeddedEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_format_detection() {
        // GGUF detection
        assert_eq!(ModelFormat::detect("model.gguf"), ModelFormat::Gguf);
        assert_eq!(ModelFormat::detect("TheBloke/Llama-2-7B-GGUF"), ModelFormat::Gguf);
        assert_eq!(ModelFormat::detect("/path/to/models/gguf/model.bin"), ModelFormat::Gguf);

        // MLX detection
        assert_eq!(ModelFormat::detect("mlx-community/Llama-3.2-3B-4bit"), ModelFormat::MlxQuantized);
        assert_eq!(ModelFormat::detect("org/model-mlx-4bit"), ModelFormat::MlxQuantized);

        // UQFF detection
        assert_eq!(ModelFormat::detect("model.uqff"), ModelFormat::Uqff);
        assert_eq!(ModelFormat::detect("org/model-uqff"), ModelFormat::Uqff);

        // Safetensors (HuggingFace repos)
        assert_eq!(ModelFormat::detect("meta-llama/Llama-3.2-3B-Instruct"), ModelFormat::Safetensors);
        assert_eq!(ModelFormat::detect("microsoft/Phi-3.5-mini-instruct"), ModelFormat::Safetensors);

        // Local paths default to Auto
        assert_eq!(ModelFormat::detect("/local/path/model"), ModelFormat::Auto);
    }

    #[test]
    fn test_engine_creation() {
        let engine = EmbeddedEngine::new();
        assert!(!engine.is_model_loaded());
        assert!(engine.get_model_id().is_none());
        assert!(engine.get_model_format().is_none());
    }

    #[test]
    fn test_default_options() {
        let options = LoadModelOptions::default();
        assert_eq!(options.format, ModelFormat::Auto);
        assert_eq!(options.quantization, Some("Q4_K".to_string()));
        assert_eq!(options.use_isq, Some(true));
        assert_eq!(options.paged_attention, Some(true));
    }
}
