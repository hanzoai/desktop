use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use opener::open;
use regex::Regex;
use tauri::AppHandle;
use tokio::sync::mpsc::Sender;

use crate::local_hanzo_node::hanzo_node_options::HanzoNodeOptions;

use super::{
    process_handler::{ProcessHandler, ProcessHandlerEvent},
    process_utils::{kill_existing_processes_using_ports, options_to_env},
};

pub struct HanzoNodeProcessHandler {
    app: AppHandle,
    process_handler: ProcessHandler,
    app_resource_dir: PathBuf,
    app_data_dir: PathBuf,
    options: HanzoNodeOptions,
}

impl HanzoNodeProcessHandler {
    const HEALTH_REQUEST_TIMEOUT_MS: u64 = 250;
    // Cold node start (DB open + migrations + API bind) can exceed 10s under load
    // (e.g. concurrent downloads, first-run on slow disk/network); allow more headroom.
    const HEALTH_TIMEOUT_MS: u64 = 60000;
    const PROCESS_NAME: &'static str = "hanzo-node";

    pub fn new(
        app: AppHandle,
        event_sender: Sender<ProcessHandlerEvent>,
        app_resource_dir: PathBuf,
        app_data_dir: PathBuf,
    ) -> Self {
        let options =
            HanzoNodeOptions::with_app_options(app_resource_dir.clone(), app_data_dir.clone());

        let node_api_ip = options.clone().node_api_ip.unwrap_or_default();
        let node_api_port = options.clone().node_api_port.unwrap_or_default();
        // warp prints "listening on http://127.0.0.1:3690" when the API is up.
        // The address is escaped because its dots are regex wildcards, and a
        // failure to compile logs rather than panics — nothing about matching
        // a log line is worth taking the app down for.
        let ready_pattern = regex::escape(&format!(
            "listening on http://{}:{}",
            node_api_ip, node_api_port
        ));
        let ready_matcher = Regex::new(&ready_pattern).unwrap_or_else(|e| {
            // Escaped text should always compile; if it somehow does not, a
            // looser match still beats taking the process down over a log line.
            log::error!("[node] readiness pattern would not compile ({e}); matching loosely");
            Regex::new("listening on http").expect("a literal is a valid regex")
        });
        let process_handler = ProcessHandler::new(
            app.clone(),
            Self::PROCESS_NAME.to_string(),
            event_sender,
            ready_matcher,
        );

        HanzoNodeProcessHandler {
            app,
            process_handler,
            app_resource_dir,
            app_data_dir,
            options,
        }
    }

    fn get_base_url(&self) -> String {
        let ip = self.options.clone().node_api_ip.unwrap();
        let port = self.options.clone().node_api_port.unwrap();
        let base_url = format!("http://{}:{}", ip, port);
        base_url
    }

    async fn health(base_url: &str, timeout: Duration) -> bool {
        // The node mounts two different APIs, not two versions of one: `/v1`
        // is the OpenAI-compatible surface (chat, completions, models) and
        // `/v2` is the node's own control plane. Readiness lives on the
        // control plane. Measured against the shipped sidecar:
        // `/v2/health_check` -> 200, `/v1/health_check` -> 404.
        let url = format!("{}/v2/health_check", base_url);
        let client = reqwest::Client::new();
        log::info!(
            "checking hanzo-nodehealth of {} with timeout {:?}",
            url,
            timeout
        );
        match client.get(&url).timeout(timeout).send().await {
            Ok(response) => {
                let status = response.status();
                let text = response.text().await;
                log::info!("health check response: {:?} {:?}", status, text);
                status == reqwest::StatusCode::OK
            }
            Err(e) => {
                log::info!("health check failed {:?}", e);
                false
            }
        }
    }

    async fn wait_hanzo_node_server(&self) -> Result<(), String> {
        let max_wait_time = Duration::from_millis(Self::HEALTH_TIMEOUT_MS);
        let default_timeout = Duration::from_millis(Self::HEALTH_REQUEST_TIMEOUT_MS);
        let timeout = default_timeout;
        let mut retries: u32 = 0;
        const MAX_BACKOFF: Duration = Duration::from_secs(2);
        let start_time = std::time::Instant::now();
        let base_url = self.get_base_url();
        tokio::select! {
            _ = tokio::time::sleep(max_wait_time) => {
                let elapsed = start_time.elapsed();
                Err(format!("wait hanzo-node server timeout after {}ms", elapsed.as_millis()))
            }
            _ = tokio::spawn(async move {
                loop {
                    if Self::health(base_url.as_str(), timeout).await {
                        break;
                    }
                    retries += 1;

                    // Back off the wait between attempts, not the request
                    // timeout: growing the timeout made each attempt slower to
                    // fail while the loop still ran every 50ms, so a node that
                    // answers 404 gets thousands of requests a second and the
                    // log fills with retries that never happened.
                    let backoff = default_timeout
                        .checked_mul(1 << retries.min(6))
                        .unwrap_or(MAX_BACKOFF)
                        .min(MAX_BACKOFF);
                    log::info!("health check failed, retrying in {:?}", backoff);
                    tokio::time::sleep(backoff).await;
                }
            }) => {
                Ok(())
            }
        }
    }

    pub fn set_options(&mut self, options: HanzoNodeOptions) -> HanzoNodeOptions {
        self.options = HanzoNodeOptions::from_merge(self.options.clone(), options);
        self.options.clone()
    }

    pub async fn remove_storage(&self, preserve_keys: bool) -> Result<(), String> {
        if self.process_handler.is_running().await {
            return Err("can't remove node storage while it's running".to_string());
        }
        let options = self.options.clone();
        let storage_path = options.node_storage_path.unwrap();
        for entry in fs::read_dir(storage_path)
            .map_err(|e| format!("Failed to read storage directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            if path.is_dir() {
                fs::remove_dir_all(path)
                    .map_err(|e| format!("Failed to remove directory: {}", e))?;
            } else {
                if preserve_keys && path.ends_with(".secret") {
                    // Delete the line starting with 'GLOBAL_IDENTITY_NAME=' in .secret file
                    if path.file_name().unwrap() == ".secret" {
                        let content = fs::read_to_string(&path)
                            .map_err(|e| format!("Failed to read .secret file: {}", e))?;
                        let new_content: String = content
                            .lines()
                            .filter(|line| !line.starts_with("GLOBAL_IDENTITY_NAME="))
                            .collect::<Vec<&str>>()
                            .join("\n");
                        fs::write(&path, new_content)
                            .map_err(|e| format!("Failed to write updated .secret file: {}", e))?;
                    }
                    continue;
                }
                fs::remove_file(path).map_err(|e| format!("Failed to remove file: {}", e))?;
            }
        }
        Ok(())
    }

    pub async fn spawn(&self) -> Result<(), String> {
        let _ = self.kill().await;

        let env = options_to_env(&self.options.clone());
        self.process_handler.spawn(env, [].to_vec(), None).await?;

        // A node that has not answered yet is not a node that failed. Killing
        // it here is what trapped first-run onboarding: the process was up and
        // still starting, the probe gave up first, and the app destroyed the
        // thing it was waiting for and reported failure. Leave it running and
        // let whoever needs it find it — the health probe is a readiness hint,
        // not a verdict.
        if let Err(e) = self.wait_hanzo_node_server().await {
            log::warn!("[node] not ready yet ({e}); leaving it to finish starting");
        }
        Ok(())
    }

    pub fn set_default_options(&mut self) -> HanzoNodeOptions {
        self.options = HanzoNodeOptions::with_app_options(
            self.app_resource_dir.clone(),
            self.app_data_dir.clone(),
        );
        self.options.clone()
    }

    pub fn get_options(&self) -> HanzoNodeOptions {
        self.options.clone()
    }

    pub async fn is_running(&self) -> bool {
        self.process_handler.is_running().await
    }

    pub async fn kill_existing_processes_using_ports(&self) -> Result<(), String> {
        // Extract ports from options
        let ports: Vec<&str> = vec![
            self.options.node_port.as_deref(),
            self.options.node_ws_port.as_deref(),
            self.options.node_api_port.as_deref(),
        ]
        .into_iter()
        .flatten()
        .collect();

        let _ = kill_existing_processes_using_ports(self.app.clone(), ports).await;
        Ok(())
    }

    pub async fn kill(&self) {
        self.process_handler.kill().await;
        let _ = self.kill_existing_processes_using_ports().await;
    }

    pub fn open_storage_location(&self) -> Result<(), String> {
        let options = self.options.clone();
        let storage_path: PathBuf = options
            .node_storage_path
            .ok_or_else(|| "Storage path not set".to_string())?
            .into();

        opener::open(&storage_path).map_err(|e| format!("Failed to open storage location: {}", e))
    }

    pub fn open_storage_location_with_path(&self, relative_path: &str) -> Result<(), String> {
        let options = self.options.clone();
        let storage_path: PathBuf = options
            .node_storage_path
            .ok_or_else(|| "Storage path not set".to_string())?
            .into();

        // Sanitize the relative path to prevent directory traversal
        let safe_path = relative_path
            .split(['/', '\\']) // Handle both Unix and Windows path separators
            .filter(|component| !component.is_empty() && component != &"." && component != &"..");

        // Build the target path by joining components
        let target_path = safe_path.fold(storage_path.clone(), |acc: PathBuf, component| {
            acc.join(component)
        });

        // Verify the target path is within storage_path
        if !target_path.starts_with(&storage_path) {
            return Err("Invalid path: attempting to access outside storage directory".to_string());
        }

        // Check if path exists
        if !target_path.exists() {
            return Err(format!("Path does not exist: {}", target_path.display()));
        }

        opener::open(&target_path).map_err(|e| format!("Failed to open location: {}", e))
    }

    pub fn open_chat_folder(
        &self,
        storage_location: &str,
        chat_folder_name: &str,
    ) -> Result<(), String> {
        let storage_path = Path::new(storage_location);
        let filesystem_path = Path::new("filesystem");
        let chat_path = Path::new(chat_folder_name);
        let full_path = storage_path.join(filesystem_path).join(chat_path);

        let full_path_str = match full_path.to_str() {
            Some(s) => s.to_string(), // Convert to owned String
            None => return Err("Invalid path".to_string()),
        };

        match open(full_path_str) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open folder: {}", e)),
        }
    }
}
