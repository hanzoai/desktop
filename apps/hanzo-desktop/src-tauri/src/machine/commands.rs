use tauri::{Emitter, Window};
use uuid::Uuid;

use super::client::{MachinedClient, MachinedError};
use super::types::{ExecFrame, Health, Machine, MachineSpec};

fn err(e: MachinedError) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn machine_health() -> Result<Health, String> {
    MachinedClient::new().health().await.map_err(err)
}

#[tauri::command]
pub async fn machine_list() -> Result<Vec<Machine>, String> {
    MachinedClient::new().list().await.map_err(err)
}

#[tauri::command]
pub async fn machine_get(name: String) -> Result<Machine, String> {
    MachinedClient::new().get(&name).await.map_err(err)
}

#[tauri::command]
pub async fn machine_create(spec: MachineSpec) -> Result<Machine, String> {
    MachinedClient::new().create(&spec).await.map_err(err)
}

#[tauri::command]
pub async fn machine_start(name: String) -> Result<(), String> {
    MachinedClient::new().start(&name).await.map_err(err)
}

#[tauri::command]
pub async fn machine_stop(name: String) -> Result<(), String> {
    MachinedClient::new().stop(&name).await.map_err(err)
}

#[tauri::command]
pub async fn machine_delete(name: String) -> Result<(), String> {
    MachinedClient::new().delete(&name).await.map_err(err)
}

/// Spawns a command inside the machine and forwards each daemon frame to the
/// caller as a window event. The returned `id` lets the caller correlate a
/// specific exec session — listen on `machine://exec/<id>/chunk` and
/// `machine://exec/<id>/exit`.
#[tauri::command]
pub async fn machine_exec(
    window: Window,
    name: String,
    cmd: Vec<String>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let mut rx = MachinedClient::new()
        .exec_stream(&name, &cmd)
        .await
        .map_err(err)?;
    let chunk_evt = format!("machine://exec/{}/chunk", id);
    let exit_evt = format!("machine://exec/{}/exit", id);
    tauri::async_runtime::spawn(async move {
        while let Some(frame) = rx.recv().await {
            match frame {
                Ok(ExecFrame::Chunk { stream, data }) => {
                    let _ = window.emit(
                        &chunk_evt,
                        serde_json::json!({ "stream": stream, "data": data }),
                    );
                }
                Ok(ExecFrame::Exit { exit }) => {
                    let _ = window.emit(&exit_evt, serde_json::json!({ "exit": exit }));
                    return;
                }
                Err(e) => {
                    let _ = window.emit(
                        &exit_evt,
                        serde_json::json!({ "exit": -1, "error": e.to_string() }),
                    );
                    return;
                }
            }
        }
    });
    Ok(id)
}

/// Starts a background task that forwards machined SSE events to the window
/// as `machine://event` until the daemon closes the connection.
#[tauri::command]
pub async fn machine_events_subscribe(window: Window) -> Result<(), String> {
    let mut rx = MachinedClient::new().events_sse().await.map_err(err)?;
    tauri::async_runtime::spawn(async move {
        while let Some(evt) = rx.recv().await {
            match evt {
                Ok(e) => {
                    let _ = window.emit("machine://event", e);
                }
                Err(e) => {
                    let _ = window.emit(
                        "machine://event",
                        serde_json::json!({ "error": e.to_string() }),
                    );
                    return;
                }
            }
        }
    });
    Ok(())
}
