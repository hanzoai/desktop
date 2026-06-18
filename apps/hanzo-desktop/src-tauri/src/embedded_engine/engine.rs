//! Orchestrator for the embedded Hanzo Engine.
//!
//! This used to be a second, hand-rolled inference engine that wrapped the
//! `hanzo` SDK (`Model`, `send_chat_request`, ...) behind a bespoke OpenAI
//! server. That parallel implementation is gone. The embedded engine now builds
//! and serves the canonical `hanzo-server-core` stack -- the exact same
//! `SharedHanzoState` + axum `Router` that `hanzo serve` uses -- so the desktop
//! node speaks `/v1/chat/completions`, `/v1/responses` and `/v1/messages`
//! identically to the CLI, with zero duplicated route logic.
//!
//! [`EmbeddedEngine`] owns the model lifecycle: loading a model builds a fresh
//! `SharedHanzoState` via [`HanzoForServerBuilder`] (which loads the weights,
//! exactly as the CLI does) and rebinds the canonical server on
//! [`DEFAULT_PORT`]. Unloading stops the server and drops the state. There is
//! only one model-load path; the Tauri IPC commands and the `/v1/engine/*` HTTP
//! management routes both funnel through here.

use std::sync::Arc;

use anyhow::{anyhow, Result};
use tokio::sync::RwLock;

use hanzo_engine::ModelSelected;
use hanzo_server_core::{
    hanzo_for_server_builder::HanzoForServerBuilder,
    hanzo_server_router_builder::HanzoServerRouterBuilder, types::SharedHanzoState,
};

use super::server::DEFAULT_PORT;
use super::types::*;

/// Handle to the currently-bound canonical server. Sending on `shutdown_tx`
/// triggers graceful shutdown; awaiting `join` blocks until the `axum::serve`
/// task has actually returned and released the TCP socket -- which we must do
/// before rebinding the same port on a model swap (otherwise `bind` can race
/// the old listener's teardown and hit `EADDRINUSE`).
struct ServerHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
    join: tokio::task::JoinHandle<()>,
}

/// The embedded inference orchestrator.
///
/// Holds the canonical engine state and the running server handle. A model is
/// loaded lazily: until [`Self::load_model`] is called there is no state and no
/// bound port (building an `Arc<Hanzo>` requires a model, so we cannot bind an
/// empty server up front).
pub struct EmbeddedEngine {
    /// The canonical shared state (`Arc<Hanzo>`). `Some` once a model is loaded.
    state: Option<SharedHanzoState>,
    /// Current model identifier (the HF repo / path that was loaded).
    model_id: Option<String>,
    /// Current model format.
    model_format: Option<ModelFormat>,
    /// Device label for status reporting ("metal" | "cuda" | "cpu").
    device: String,
    /// Listen port for the canonical server.
    port: u16,
    /// Handle to the running server, if any.
    server: Option<ServerHandle>,
    /// Back-reference to the shared orchestrator, so the `/v1/engine/*` HTTP
    /// handlers can drive this same instance. Wired once by `main.rs`.
    management: Option<Arc<RwLock<EmbeddedEngine>>>,
}

impl EmbeddedEngine {
    /// Create a new, idle orchestrator (no model, no bound server).
    pub fn new() -> Self {
        Self {
            state: None,
            model_id: None,
            model_format: None,
            device: Self::detect_device(),
            port: DEFAULT_PORT,
            server: None,
            management: None,
        }
    }

    /// Detect the best available device label for status reporting.
    #[allow(unreachable_code)]
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

    /// The base URL clients should target for this engine.
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Current engine status (drives `/v1/engine/status` and the IPC command).
    pub async fn get_status(&self) -> EngineStatus {
        EngineStatus {
            initialized: self.state.is_some(),
            loaded_model: self.model_id.clone(),
            device: self.device.clone(),
            memory_usage: None,
            is_busy: false,
        }
    }

    /// The canonical shared state, if a model is loaded.
    pub fn state(&self) -> Option<SharedHanzoState> {
        self.state.clone()
    }

    /// Load a model with automatic format detection, then (re)start the
    /// canonical server bound to the freshly built state.
    pub async fn load_model(&mut self, options: LoadModelOptions) -> Result<()> {
        let format = match options.format {
            ModelFormat::Auto => ModelFormat::detect(&options.model_id),
            f => f,
        };
        log::info!(
            "Loading model: {} (format: {:?})",
            options.model_id,
            format
        );

        let model_selected = options_to_model_selected(&options, format)?;
        let force_cpu = matches!(options.device.as_deref(), Some("cpu")) || self.device == "cpu";

        // Build the canonical state exactly like `hanzo serve`: this loads the
        // weights and registers the model as the default engine. ISQ is applied
        // for non-GGUF formats when requested (GGUF is already quantized).
        let in_situ_quant = match format {
            ModelFormat::Gguf | ModelFormat::Uqff => None,
            _ if options.use_isq.unwrap_or(true) => options.quantization.clone(),
            _ => None,
        };

        let builder = HanzoForServerBuilder::new()
            .with_model(model_selected)
            .with_interactive_mode(false)
            .with_cpu(force_cpu)
            .set_paged_attn(options.paged_attention)
            .with_in_situ_quant_optional(in_situ_quant);

        let state = builder
            .build()
            .await
            .map_err(|e| anyhow!("failed to build engine state: {e}"))?;

        // Swap the running server over to the new state.
        self.stop_server().await;
        self.start_server(state.clone()).await?;

        self.state = Some(state);
        self.model_id = Some(options.model_id);
        self.model_format = Some(format);
        log::info!("Model loaded and canonical server (re)started");
        Ok(())
    }

    /// Load a GGUF model (already quantized -- no ISQ).
    pub async fn load_gguf_model(&mut self, mut options: LoadModelOptions) -> Result<()> {
        options.format = ModelFormat::Gguf;
        self.load_model(options).await
    }

    /// Load a HuggingFace safetensors model (ISQ applied on load).
    pub async fn load_hf_model(&mut self, mut options: LoadModelOptions) -> Result<()> {
        options.format = ModelFormat::Safetensors;
        self.load_model(options).await
    }

    /// Unload the current model and stop the canonical server.
    pub async fn unload_model(&mut self) -> Result<()> {
        if self.state.is_some() {
            log::info!("Unloading model and stopping canonical server");
        }
        self.stop_server().await;
        self.state = None;
        self.model_id = None;
        self.model_format = None;
        Ok(())
    }

    /// Whether a model is loaded (and thus the server is serving).
    pub fn is_model_loaded(&self) -> bool {
        self.state.is_some()
    }

    /// The currently loaded model id, if any.
    pub fn get_model_id(&self) -> Option<&str> {
        self.model_id.as_deref()
    }

    /// The currently loaded model format, if any.
    pub fn get_model_format(&self) -> Option<ModelFormat> {
        self.model_format
    }

    /// Stop the running server, if any (graceful shutdown).
    async fn stop_server(&mut self) {
        if let Some(handle) = self.server.take() {
            // Signal graceful shutdown, then wait for the serve task to finish
            // so the listening socket is released before any rebind. If the
            // receiver was already dropped the task is gone anyway; either way
            // we then await the join so a subsequent `bind` on the same port
            // cannot race the old listener's teardown.
            let _ = handle.shutdown_tx.send(());
            let _ = handle.join.await;
        }
    }

    /// Build the canonical router (+ `/v1/engine/*` management) for `state` and
    /// serve it in the background on [`Self::port`]. Stores the shutdown handle.
    async fn start_server(&mut self, state: SharedHanzoState) -> Result<()> {
        let app = build_app(state, self.management_state()).await?;
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = tokio::net::TcpListener::bind(&addr).await?;
        log::info!("Embedded Hanzo server (canonical) listening on {}", addr);

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let join = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .unwrap_or_else(|e| log::error!("Embedded engine server error: {}", e));
        });
        self.server = Some(ServerHandle { shutdown_tx, join });
        Ok(())
    }

    /// The `Arc<RwLock<EmbeddedEngine>>` the management router calls back into.
    /// Set by [`Self::set_management_state`] once the orchestrator is shared.
    fn management_state(&self) -> Option<Arc<RwLock<EmbeddedEngine>>> {
        self.management.clone()
    }

    /// Back-reference used so the `/v1/engine/*` HTTP handlers can drive this
    /// same orchestrator. Wired once by `main.rs` after `.manage()`.
    pub fn set_management_state(&mut self, this: Arc<RwLock<EmbeddedEngine>>) {
        self.management = Some(this);
    }
}

impl Default for EmbeddedEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Build the merged canonical + management axum app for `state`.
pub(super) async fn build_app(
    state: SharedHanzoState,
    management: Option<Arc<RwLock<EmbeddedEngine>>>,
) -> Result<axum::Router> {
    let canonical = HanzoServerRouterBuilder::new()
        .with_hanzo(state)
        .build()
        .await?;
    match management {
        Some(engine) => Ok(canonical.merge(super::management::router(engine))),
        None => Ok(canonical),
    }
}

/// Translate the desktop's [`LoadModelOptions`] into the engine's
/// [`ModelSelected`], mirroring `hanzo serve`'s `convert_to_model_selected`.
fn options_to_model_selected(
    options: &LoadModelOptions,
    format: ModelFormat,
) -> Result<ModelSelected> {
    use hanzo_engine::AutoDeviceMapParams;
    let max_seq_len = options
        .max_seq_len
        .unwrap_or(AutoDeviceMapParams::DEFAULT_MAX_SEQ_LEN);
    let max_batch_size = AutoDeviceMapParams::DEFAULT_MAX_BATCH_SIZE;

    match format {
        // Pre-quantized single-file GGUF. The model id doubles as the repo and
        // the quantized filename (matching the prior loader's behavior).
        ModelFormat::Gguf => Ok(ModelSelected::GGUF {
            tok_model_id: options.tokenizer_json.clone(),
            quantized_model_id: options.model_id.clone(),
            quantized_filename: options.model_id.clone(),
            dtype: hanzo_engine::ModelDType::Auto,
            topology: None,
            max_seq_len,
            max_batch_size,
        }),
        // Everything else (safetensors / MLX / UQFF / auto) goes through the
        // auto loader, which detects the architecture and quant layout.
        _ => Ok(ModelSelected::Run {
            model_id: options.model_id.clone(),
            tokenizer_json: options.tokenizer_json.clone(),
            dtype: hanzo_engine::ModelDType::Auto,
            topology: None,
            organization: None,
            write_uqff: None,
            from_uqff: None,
            imatrix: None,
            calibration_file: None,
            max_edge: None,
            max_seq_len,
            max_batch_size,
            max_num_images: None,
            max_image_length: None,
            hf_cache_path: None,
            matformer_config_path: None,
            matformer_slice_name: None,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_format_detection() {
        assert_eq!(ModelFormat::detect("model.gguf"), ModelFormat::Gguf);
        assert_eq!(
            ModelFormat::detect("TheBloke/Llama-2-7B-GGUF"),
            ModelFormat::Gguf
        );
        assert_eq!(
            ModelFormat::detect("mlx-community/Llama-3.2-3B-4bit"),
            ModelFormat::MlxQuantized
        );
        assert_eq!(ModelFormat::detect("model.uqff"), ModelFormat::Uqff);
        assert_eq!(
            ModelFormat::detect("meta-llama/Llama-3.2-3B-Instruct"),
            ModelFormat::Safetensors
        );
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
    fn test_options_to_model_selected_gguf() {
        let opts = LoadModelOptions {
            model_id: "zenlm/zen-5-nano-2B-gguf".to_string(),
            ..Default::default()
        };
        let sel = options_to_model_selected(&opts, ModelFormat::Gguf).unwrap();
        assert!(matches!(sel, ModelSelected::GGUF { .. }));
    }

    #[test]
    fn test_options_to_model_selected_run() {
        let opts = LoadModelOptions {
            model_id: "zenlm/zen-nano-0.6b".to_string(),
            ..Default::default()
        };
        let sel = options_to_model_selected(&opts, ModelFormat::Safetensors).unwrap();
        assert!(matches!(sel, ModelSelected::Run { .. }));
    }
}
