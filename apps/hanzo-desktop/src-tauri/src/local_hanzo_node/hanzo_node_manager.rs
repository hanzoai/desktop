use std::path::PathBuf;

// Ollama has been fully retired: the desktop never spawns, kills or otherwise
// manages an `ollama` process. Local chat is the model the person chose on the
// Local AI screen, served by hanzo-engine on :36900 (`crate::local_models`).
use super::process_handlers::hanzo_node_process_handler::HanzoNodeProcessHandler;
use crate::local_hanzo_node::hanzo_node_options::HanzoNodeOptions;
use crate::local_hanzo_node::session;
use anyhow::Result;
use futures_util::StreamExt;
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

    StartingEngine,
    EngineStarted,
    EngineStartError { error: String },

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

    StoppingEngine,
    EngineStopped,
    EngineStopError { error: String },
}

pub struct HanzoNodeManager {
    app: AppHandle,
    hanzo_node_process: HanzoNodeProcessHandler,
    /// The Hanzo key the running node was spawned with (a digest, never the
    /// key), or `None` while no node of ours runs. A new sign-in restarts the
    /// node when it would get a different one (`session_changed`).
    event_broadcaster: broadcast::Sender<HanzoNodeManagerEvent>,
    app_resource_dir: PathBuf,
    llm_models_path: PathBuf,
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
            app: app.clone(),
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
        self.hanzo_node_process.is_running().await
    }

    pub async fn spawn(&mut self) -> Result<(), String> {
        // Nothing is started here any more. hanzo-node left this app and :3690
        // belongs to the per-machine daemon, `hanzod` (HIP-1330). The engine
        // runs only when the person picks a model on the Local AI screen
        // (`crate::local_models`): starting it at boot downloaded a 2 GB model
        // nobody asked for, with arguments (`--port N gguf -m ...`) the released
        // `hanzo-engine` no longer takes, and fell back to an Ollama this app
        // retired.
        Ok(())
    }

    /// The app's sign-in changed. There is no node to restart: it left this app
    /// (HIP-1330), and the engines read no session key.
    pub async fn session_changed(&mut self, _session_key: Option<String>) {}

    pub async fn kill(&mut self) {
        self.emit_event(HanzoNodeManagerEvent::StoppingHanzoNode);
        self.emit_event(HanzoNodeManagerEvent::HanzoNodeStopped);
        // Not `local_models::stop_all()`: "Reset connection" and respawn come
        // through here, and neither should stop the person's model or cancel a
        // download. The app's exit paths stop those (main.rs, tray.rs).
        self.emit_event(HanzoNodeManagerEvent::StoppingEngine);
        self.emit_event(HanzoNodeManagerEvent::EngineStopped);
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


}
