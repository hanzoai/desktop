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
        }
    }

    pub async fn get_hanzo_node_options(&self) -> HanzoNodeOptions {
        let options = self.hanzo_node_process.get_options();
        options.clone()
    }

    pub async fn is_running(&self) -> bool {
        self.hanzo_node_process.is_running().await && self.ollama_process.is_running().await
    }

    pub async fn spawn(&mut self) -> Result<(), String> {
        self.emit_event(HanzoNodeManagerEvent::StartingOllama);
        match self.ollama_process.spawn(None).await {
            Ok(_) => {
                self.emit_event(HanzoNodeManagerEvent::OllamaStarted);
            }
            Err(e) => {
                log::info!("failed spawning ollama process {:?}", e);
                self.kill().await;
                self.emit_event(HanzoNodeManagerEvent::OllamaStartError { error: e.clone() });
                return Err(e);
            }
        }

        let ollama_api_url = self.ollama_process.get_ollama_api_base_url();
        let ollama_api = OllamaApiClient::new(ollama_api_url);

        let installed_models = match ollama_api.tags().await {
            Ok(response) => response.models.iter().map(|m| m.model.clone()).collect(),
            Err(e) => {
                log::warn!("ollama api tags request failed, fallback asuming there are not local models {:?}", e);
                vec![]
            }
        };

        let default_embedding_model = self
            .hanzo_node_process
            .get_options()
            .default_embedding_model
            .unwrap();
        if !installed_models.contains(&default_embedding_model.to_string()) {
            log::info!(
                "default embedding model {} not found in local models list [{}], creating it",
                default_embedding_model,
                installed_models.join(", ")
            );
            self.emit_event(HanzoNodeManagerEvent::CreatingModelStart {
                model: default_embedding_model.to_string(),
            });

            // Use the embedded GGUF model
            let gguf_data = embedding_model::get_model_data(&self.llm_models_path);

            match ollama_api
                .create_model_from_gguf(&default_embedding_model, gguf_data)
                .await
            {
                Ok(_) => {
                    self.emit_event(HanzoNodeManagerEvent::CreatingModelDone {
                        model: default_embedding_model.to_string(),
                    });
                }
                Err(e) => {
                    error!("failed to create model from gguf: {}", e);
                    self.kill().await;
                    self.emit_event(HanzoNodeManagerEvent::CreatingModelError {
                        model: default_embedding_model.to_string(),
                        error: e.to_string(),
                    });
                    return Err(e.to_string());
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
