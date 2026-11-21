use std::path::PathBuf;

// Ollama has been fully retired. Chat is served by the native hanzo-engine on
// :36900 and embeddings by the native engine on :36901. The desktop must never
// spawn, kill, or otherwise manage an `ollama` process. The ollama_api /
// ollama_process_handler modules are intentionally NOT imported here so no
// ollama lifecycle code can run during startup/shutdown/restart.
use super::process_handlers::hanzo_node_process_handler::HanzoNodeProcessHandler;
use crate::local_hanzo_node::hanzo_node_options::HanzoNodeOptions;
use crate::local_hanzo_node::session;
use anyhow::Result;
use hanzo_node_env::SpawnedKey;
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

/// What starting the chat engine on :36900 came to.
enum EngineLaunch {
    /// We started it; the child is ours to stop.
    Spawned(std::process::Child),
    /// Something was already listening; it is not ours to stop.
    Reused,
    /// No engine binary is installed (release bundles ship none), so nothing runs.
    NotInstalled,
}

pub struct HanzoNodeManager {
    app: AppHandle,
    hanzo_node_process: HanzoNodeProcessHandler,
    /// The Hanzo key the running node was spawned with (a digest, never the
    /// key), or `None` while no node of ours runs. A new sign-in restarts the
    /// node when it would get a different one (`session_changed`).
    node_key: Option<SpawnedKey>,
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
            app: app.clone(),
            node_key: None,
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

    /// The `hanzo-server` binary to run, or `None` when none is installed.
    /// Release bundles do not ship it (cloud#760), so `None` is the normal case
    /// there and both engine ports are skipped without an error.
    fn engine_bin() -> Option<String> {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf));
        hanzo_engine_bin::resolve(
            std::env::var_os(hanzo_engine_bin::OVERRIDE_VAR).as_deref(),
            exe_dir.as_deref(),
            std::env::var_os("PATH").as_deref(),
        )
        .map(|p| p.to_string_lossy().into_owned())
    }

    /// Fallback when hanzo-server is missing or will not start: reuse, or
    /// start, a local inference runtime on :11434 if the system has one, so
    /// local models still work. `None` when there is none.
    async fn local_runtime_fallback() -> Option<EngineLaunch> {
        if Self::engine_up("http://127.0.0.1:11434/api/tags").await {
            log::info!("local inference runtime already listening on :11434, reusing it");
            return Some(EngineLaunch::Reused);
        }
        for candidate in ["ollama", "/opt/homebrew/bin/ollama", "/usr/local/bin/ollama"] {
            if let Ok(child) = std::process::Command::new(candidate)
                .arg("serve")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
            {
                log::info!("spawned local inference runtime `{}` on :11434", candidate);
                return Some(EngineLaunch::Spawned(child));
            }
        }
        None
    }

    /// Spawn (or reuse) the daemon-managed inference engine — hanzo-engine
    /// (mistral.rs, CUDA on GPU). An engine already listening on the port is
    /// reused; with no engine installed the local engine is skipped.
    async fn spawn_engine(&self) -> Result<EngineLaunch, String> {
        let port = std::env::var("HANZO_ENGINE_PORT").unwrap_or_else(|_| "36900".to_string());
        let models_url = format!("http://127.0.0.1:{}/health", port);

        if Self::engine_up(&models_url).await {
            log::info!("hanzo-engine already listening on :{}, reusing it", port);
            return Ok(EngineLaunch::Reused);
        }

        let Some(bin) = Self::engine_bin() else {
            if let Some(launch) = Self::local_runtime_fallback().await {
                return Ok(launch);
            }
            log::info!(
                "no local inference engine: `{}` is not in the app bundle or on PATH and {} is unset; \
                 skipping the local engine on :{} (cloud models are unaffected)",
                hanzo_engine_bin::file_name(),
                hanzo_engine_bin::OVERRIDE_VAR,
                port
            );
            return Ok(EngineLaunch::NotInstalled);
        };
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

        match cmd.spawn() {
            Ok(child) => {
                log::info!(
                    "hanzo-engine spawned on :{} (loading model in background)",
                    port
                );
                Ok(EngineLaunch::Spawned(child))
            }
            Err(e) => match Self::local_runtime_fallback().await {
                Some(launch) => Ok(launch),
                None => Err(format!("failed to spawn hanzo-engine ({}): {}", bin, e)),
            },
        }
    }

    pub async fn spawn(&mut self) -> Result<(), String> {
        // Daemon-managed inference engine (hanzo-engine / mistral.rs on the GPU)
        // replaces Ollama. The node daemon owns the engine lifecycle; if one is
        // already listening on the engine port we detect and reuse it.
        self.emit_event(HanzoNodeManagerEvent::StartingEngine);
        match self.spawn_engine().await {
            Ok(EngineLaunch::Spawned(child)) => {
                self.engine_child = Some(child);
                self.emit_event(HanzoNodeManagerEvent::EngineStarted);
            }
            Ok(EngineLaunch::Reused) => {
                self.engine_child = None;
                self.emit_event(HanzoNodeManagerEvent::EngineStarted);
            }
            Ok(EngineLaunch::NotInstalled) => {
                // Not a failure: the bundle does not ship an engine. Logged at
                // INFO in spawn_engine; the event says the engine is not running.
                self.engine_child = None;
                self.emit_event(HanzoNodeManagerEvent::EngineStartError {
                    error: format!("{} is not installed", hanzo_engine_bin::file_name()),
                });
            }
            Err(e) => {
                log::error!("failed to start hanzo-engine: {}", e);
                self.emit_event(HanzoNodeManagerEvent::EngineStartError { error: e.clone() });
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
            } else if let Some(ebin) = Self::engine_bin() {
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
            } else {
                log::info!(
                    "no local embedding engine: `{}` is not installed; skipping :{}",
                    hanzo_engine_bin::file_name(),
                    eport
                );
            }
        }

        let session_key = session::current_key(&self.app);
        if let Err(e) = self.spawn_node(session_key.as_deref()).await {
            self.kill().await;
            self.emit_event(HanzoNodeManagerEvent::HanzoNodeStartError {
                error: e.clone(),
            });
            return Err(e);
        }
        Ok(())
    }

    /// Starts (or restarts) the node alone, with the signed-in `session_key`,
    /// and remembers which key it holds. The engines are left as they are.
    /// The caller reports a failure (`HanzoNodeStartError`).
    async fn spawn_node(&mut self, session_key: Option<&str>) -> Result<(), String> {
        let env = self.hanzo_node_process.spawn_env(session_key);
        let key = SpawnedKey::of(&env);
        self.node_key = None;
        self.emit_event(HanzoNodeManagerEvent::StartingHanzoNode);
        match self.hanzo_node_process.spawn(env).await {
            Ok(_) => {
                log::info!(
                    "hanzo-node started {} a Hanzo key for embeddings",
                    if key.is_signed_in() { "with" } else { "without" }
                );
                self.node_key = Some(key);
                self.emit_event(HanzoNodeManagerEvent::HanzoNodeStarted);
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    /// The app's sign-in changed (signed in, signed out, or a refreshed
    /// token): `session_key` is the key now. Restarts the node, and only the
    /// node, when the one it runs with differs from the one it would get. A
    /// node that is not running is left alone; its next start reads the
    /// session itself.
    pub async fn session_changed(&mut self, session_key: Option<String>) {
        if !self.hanzo_node_process.is_running().await {
            self.node_key = None;
            return;
        }
        let next = self.hanzo_node_process.spawn_env(session_key.as_deref());
        if !hanzo_node_env::needs_restart(self.node_key.as_ref(), &next) {
            return;
        }
        log::info!("Hanzo sign-in changed; restarting hanzo-node so its embeddings use it");
        if let Err(e) = self.spawn_node(session_key.as_deref()).await {
            log::error!("[hanzo-node] restart after sign-in change failed: {}", e);
            self.emit_event(HanzoNodeManagerEvent::HanzoNodeStartError { error: e });
        }
    }

    pub async fn kill(&mut self) {
        self.emit_event(HanzoNodeManagerEvent::StoppingHanzoNode);
        self.hanzo_node_process.kill().await;
        self.node_key = None;
        self.emit_event(HanzoNodeManagerEvent::HanzoNodeStopped);
        self.emit_event(HanzoNodeManagerEvent::StoppingEngine);
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
