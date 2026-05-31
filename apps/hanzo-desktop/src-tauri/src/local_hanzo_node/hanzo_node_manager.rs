use std::fs;
use std::path::PathBuf;

use super::ollama_api::ollama_api_client::OllamaApiClient;
use super::ollama_api::ollama_api_types::OllamaApiPullResponse;
use super::process_handlers::ollama_process_handler::OllamaProcessHandler;
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
    ollama_process: OllamaProcessHandler,
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
        let (ollama_sender, _ollama_receiver) = channel(100);
        let (hanzo_node_sender, _hanzo_node_receiver) = channel(100);
        let (event_broadcaster, _) = broadcast::channel(10);
        let llm_models_path = app
            .path()
            .resolve("llm-models", BaseDirectory::Resource)
            .unwrap();
        HanzoNodeManager {
            ollama_process: OllamaProcessHandler::new(
                app.clone(),
                ollama_sender,
                app_resource_dir.clone(),
            ),
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
        let models_url = format!("http://127.0.0.1:{}/v1/models", port);

        if Self::engine_up(&models_url).await {
            log::info!("hanzo-engine already listening on :{}, reusing it", port);
            return Ok(None);
        }

        let bin = std::env::var("HANZO_ENGINE_BIN")
            .unwrap_or_else(|_| "/home/z/src/hanzo/engine/target/release/mistralrs-server".to_string());
        let model =
            std::env::var("HANZO_ENGINE_MODEL").unwrap_or_else(|_| "Qwen/Qwen3-0.6B".to_string());
        log::info!("starting hanzo-engine `{}` (model {}) on :{}", bin, model, port);

        let mut cmd = std::process::Command::new(&bin);
        cmd.arg("--port").arg(&port);
        if let Ok(tpl) = std::env::var("HANZO_ENGINE_CHAT_TEMPLATE") {
            if !tpl.is_empty() {
                cmd.arg("-c").arg(tpl);
            }
        }
        cmd.arg("run").arg("-m").arg(&model);

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
            let emodels = format!("http://127.0.0.1:{}/v1/models", eport);
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
        self.ollama_process.kill().await;
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

    pub fn get_ollama_api_url(&self) -> String {
        self.ollama_process.get_ollama_api_base_url()
    }

    pub async fn get_ollama_version(app: AppHandle) -> Result<String> {
        OllamaProcessHandler::version(app).await
    }
}
