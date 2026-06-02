use std::path::PathBuf;

// Ollama has been fully retired. Chat is served by the native hanzo-engine on
// :36900 and embeddings by the native engine on :36901. The desktop must never
// spawn, kill, or otherwise manage an `ollama` process. The ollama_api /
// ollama_process_handler modules are intentionally NOT imported here so no
// ollama lifecycle code can run during startup/shutdown/restart.
use super::process_handlers::hanzo_node_process_handler::HanzoNodeProcessHandler;
use crate::local_hanzo_node::hanzo_node_options::HanzoNodeOptions;
use crate::models::embedding_model;
use anyhow::Result;
use futures_util::StreamExt;
use log::error;
use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::AppHandle;
use tauri::Manager;
use tokio::sync::broadcast;
use tokio::sync::mpsc::channel;

#[derive(Serialize, Deserialize, Clone)]
pub enum HanzoNodeManagerEvent {
    StartingHanzoNode,
    HanzoNodeStarted,
    HanzoNodeStartError { error: String },

    StartingOllama,
    OllamaStarted,
    OllamaStartError { error: String },

    PullingModelStart { model: String },
    PullingModelProgress { model: String, progress: u32 },
    PullingModelDone { model: String },
    PullingModelError { model: String, error: String },

    CreatingModelStart { model: String },
    CreatingModelProgress { model: String, progress: u32 },
    CreatingModelDone { model: String },
    CreatingModelError { model: String, error: String },

    StoppingHanzoNode,
    HanzoNodeStopped,
    HanzoNodeStopError { error: String },

    StoppingOllama,
    OllamaStopped,
    OllamaStopError { error: String },
}

pub struct HanzoNodeManager {
    hanzo_node_process: HanzoNodeProcessHandler,
    event_broadcaster: broadcast::Sender<HanzoNodeManagerEvent>,
    app_resource_dir: PathBuf,
    llm_models_path: PathBuf,
    /// Child handle for the daemon-managed inference engine (hanzo-engine /
    /// mistral.rs). `None` when no engine was spawned by us (e.g. one was
    /// already running and got reused).
    engine_child: Option<std::process::Child>,
    /// Child handle for the daemon-managed embedding engine (latest Zen, 1024-dim).
    embed_child: Option<std::process::Child>,
}

impl HanzoNodeManager {
    pub(crate) fn new(app: AppHandle, app_resource_dir: PathBuf, app_data_dir: PathBuf) -> Self {
        let (hanzo_node_sender, _hanzo_node_receiver) = channel(100);
        let (event_broadcaster, _) = broadcast::channel(10);
        let llm_models_path = app
            .path()
            .resolve("llm-models", BaseDirectory::Resource)
            .unwrap();
        // No OllamaProcessHandler is constructed: ollama is retired and the
        // desktop never starts or kills it.
        HanzoNodeManager {
            hanzo_node_process: HanzoNodeProcessHandler::new(
                app,
                hanzo_node_sender,
                app_resource_dir.clone(),
                app_data_dir,
            ),
            event_broadcaster,
            app_resource_dir,
            llm_models_path,
            engine_child: None,
            embed_child: None,
        }
    }

    pub async fn get_hanzo_node_options(&self) -> HanzoNodeOptions {
        let options = self.hanzo_node_process.get_options();
        options.clone()
    }

    pub async fn is_running(&self) -> bool {
        self.hanzo_node_process.is_running().await
    }

    /// True if the inference engine's OpenAI API is responding.
    async fn engine_up(models_url: &str) -> bool {
        reqwest::Client::new()
            .get(models_url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Spawn (or reuse) the daemon-managed inference engine — hanzo-engine
    /// (mistral.rs, CUDA on GPU). Returns the child if we started it, or `None`
    /// if an engine was already listening on the port (detect-and-reuse).
    async fn spawn_engine(&self) -> Result<Option<std::process::Child>, String> {
        let port = std::env::var("HANZO_ENGINE_PORT").unwrap_or_else(|_| "36900".to_string());
        let models_url = format!("http://127.0.0.1:{}/health", port);

        if Self::engine_up(&models_url).await {
            log::info!("hanzo-engine already listening on :{}, reusing it", port);
            return Ok(None);
        }

        let bin = std::env::var("HANZO_ENGINE_BIN")
            .unwrap_or_else(|_| "/home/z/src/hanzo/engine/target/release/mistralrs-server".to_string());
        let model =
            std::env::var("HANZO_ENGINE_MODEL").unwrap_or_else(|_| "Qwen/Qwen3-0.6B".to_string());
        // Chat model. Default to the real zen chat model `zen-eco-3b-agent` (a GGUF;
        // agent-tuned, a great fit for this agent app). When a GGUF file is configured the
        // engine loads it with its EMBEDDED chat template — do NOT pass a template override
        // (`-c`/`-j`), which yields garbage. Set HANZO_ENGINE_GGUF_FILE="" to fall back to
        // the safetensors `run -m HANZO_ENGINE_MODEL` path (e.g. Qwen3-0.6B).
        let gguf_repo = std::env::var("HANZO_ENGINE_GGUF_REPO")
            .unwrap_or_else(|_| "zenlm/zen-eco-4b-agent-gguf".to_string());
        let gguf_file = std::env::var("HANZO_ENGINE_GGUF_FILE")
            .unwrap_or_else(|_| "zen-eco-3b-agent-q4_k_m.gguf".to_string());

        let mut cmd = std::process::Command::new(&bin);
        cmd.arg("--port").arg(&port);
        if !gguf_file.is_empty() {
            log::info!(
                "starting hanzo-engine `{}` (gguf {}/{}) on :{}",
                bin, gguf_repo, gguf_file, port
            );
            cmd.arg("gguf").arg("-m").arg(&gguf_repo).arg("-f").arg(&gguf_file);
        } else {
            log::info!("starting hanzo-engine `{}` (model {}) on :{}", bin, model, port);
            if let Ok(tpl) = std::env::var("HANZO_ENGINE_CHAT_TEMPLATE") {
                if !tpl.is_empty() {
                    cmd.arg("-c").arg(tpl);
                }
            }
            cmd.arg("run").arg("-m").arg(&model);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn hanzo-engine ({}): {}", bin, e))?;

        // Non-blocking: don't stall node startup on model load. The engine loads
        // in the background and the agent starts answering once it's ready.
        log::info!(
            "hanzo-engine spawned on :{} (loading model in background)",
            port
        );
        Ok(Some(child))
    }

    pub async fn spawn(&mut self) -> Result<(), String> {
        // Daemon-managed inference engine (hanzo-engine / mistral.rs on the GPU)
        // replaces Ollama. The node daemon owns the engine lifecycle; if one is
        // already listening on the engine port we detect and reuse it.
        self.emit_event(HanzoNodeManagerEvent::StartingOllama);
        match self.spawn_engine().await {
            Ok(child) => {
                self.engine_child = child;
                self.emit_event(HanzoNodeManagerEvent::OllamaStarted);
            }
            Err(e) => {
                log::error!("failed to start hanzo-engine: {}", e);
                self.emit_event(HanzoNodeManagerEvent::OllamaStartError { error: e.clone() });
                // Continue starting the node; chat is unavailable until the engine
                // is reachable, but the node and its API should still come up.
            }
        }

        // Daemon-managed embedding engine — its own instance, latest Zen
        // (Qwen-style, 1024-dim). Detect-and-reuse if one's already listening.
        {
            let eport = std::env::var("HANZO_EMBED_PORT").unwrap_or_else(|_| "36901".to_string());
            let emodels = format!("http://127.0.0.1:{}/health", eport);
            if Self::engine_up(&emodels).await {
                log::info!("embedding engine already on :{}, reusing it", eport);
            } else {
                let ebin = std::env::var("HANZO_ENGINE_BIN")
                    .unwrap_or_else(|_| "mistralrs-server".to_string());
                let emodel = std::env::var("HANZO_EMBED_MODEL")
                    .unwrap_or_else(|_| "zenlm/zen-embedding-0.6B".to_string());
                let earch = std::env::var("HANZO_EMBED_ARCH")
                    .unwrap_or_else(|_| "qwen3embedding".to_string());
                log::info!("starting embedding engine `{}` ({}) on :{}", ebin, emodel, eport);
                match std::process::Command::new(&ebin)
                    .arg("--port")
                    .arg(&eport)
                    .arg("embedding")
                    .arg("-m")
                    .arg(&emodel)
                    .arg("-a")
                    .arg(&earch)
                    .spawn()
                {
                    Ok(c) => self.embed_child = Some(c),
                    Err(e) => log::error!("failed to spawn embedding engine ({}): {}", ebin, e),
                }
            }
        }

        self.emit_event(HanzoNodeManagerEvent::StartingHanzoNode);
        match self.hanzo_node_process.spawn().await {
            Ok(_) => {
                self.emit_event(HanzoNodeManagerEvent::HanzoNodeStarted);
            }
            Err(e) => {
                self.kill().await;
                self.emit_event(HanzoNodeManagerEvent::HanzoNodeStartError {
                    error: e.clone(),
                });
                return Err(e);
            }
        }
        Ok(())
    }

    pub async fn kill(&mut self) {
        self.emit_event(HanzoNodeManagerEvent::StoppingHanzoNode);
        self.hanzo_node_process.kill().await;
        self.emit_event(HanzoNodeManagerEvent::HanzoNodeStopped);
        self.emit_event(HanzoNodeManagerEvent::StoppingOllama);
        // Stop the daemon-managed engine (only if we started it).
        if let Some(mut child) = self.engine_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(mut child) = self.embed_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // Ollama retired: nothing to kill. We do NOT pkill `ollama`/
        // `ollama_llama_server` nor sweep port 11435 — that machinery is what
        // produced the startup churn ("[ollama] no process is running to kill",
        // "failed to terminate process 'ollama_llama_se'").
        self.emit_event(HanzoNodeManagerEvent::OllamaStopped);
    }

    pub async fn remove_storage(&self, preserve_keys: bool) -> Result<(), String> {
        self.hanzo_node_process
            .remove_storage(preserve_keys)
            .await
    }

    pub fn open_storage_location(&self) -> Result<(), String> {
        self.hanzo_node_process.open_storage_location()
    }

    pub fn open_storage_location_with_path(&self, relative_path: &str) -> Result<(), String> {
        self.hanzo_node_process
            .open_storage_location_with_path(relative_path)
    }

    pub fn open_chat_folder(
        &self,
        storage_location: &str,
        chat_folder_name: &str,
    ) -> Result<(), String> {
        self.hanzo_node_process
            .open_chat_folder(storage_location, chat_folder_name)
    }

    pub async fn set_default_hanzo_node_options(&mut self) -> HanzoNodeOptions {
        self.hanzo_node_process.set_default_options()
    }

    pub async fn set_hanzo_node_options(
        &mut self,
        options: HanzoNodeOptions,
    ) -> HanzoNodeOptions {
        self.hanzo_node_process.set_options(options)
    }

    fn emit_event(&mut self, new_event: HanzoNodeManagerEvent) {
        let _ = self.event_broadcaster.send(new_event);
    }

    pub fn subscribe_to_events(
        &mut self,
    ) -> tokio::sync::broadcast::Receiver<HanzoNodeManagerEvent> {
        self.event_broadcaster.subscribe()
    }

    /// Retained for the legacy `hanzo_node_get_ollama_api_url` Tauri command.
    /// Ollama is retired; we report the native engine's OpenAI-compatible URL so
    /// any remaining frontend caller talks to hanzo-engine, never to ollama.
    pub fn get_ollama_api_url(&self) -> String {
        let port = std::env::var("HANZO_ENGINE_PORT").unwrap_or_else(|_| "36900".to_string());
        format!("http://127.0.0.1:{}", port)
    }

    /// Retained for the legacy `hanzo_node_get_ollama_version` Tauri command.
    /// Ollama is retired; never spawn the ollama sidecar. Return empty so the
    /// frontend treats it as "not present" without triggering any process.
    pub async fn get_ollama_version(_app: AppHandle) -> Result<String> {
        Ok(String::new())
    }
}
