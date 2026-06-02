//! Tauri commands exposing the `hanzo-ml` model tools (model soups / BitDelta)
//! and the GRPO developer-preview entry to the frontend.
//!
//! All commands shell out to native binaries and may run for a while, so they
//! execute on a blocking thread to avoid stalling the async runtime.

use super::soup;

/// Is the `soup` checkpoint-merging CLI available? Gates the UI panel.
#[tauri::command]
pub async fn model_tools_soup_available() -> Result<bool, String> {
    Ok(tauri::async_runtime::spawn_blocking(soup::soup_available)
        .await
        .unwrap_or(false))
}

/// Average checkpoints into a single safetensors file (model soup).
#[tauri::command]
pub async fn model_tools_soup_average(
    args: soup::SoupAverageArgs,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || soup::soup_average(args))
        .await
        .map_err(|e| format!("task join error: {}", e))?
}

/// Delta soup: base + mean(fine-tune − base).
#[tauri::command]
pub async fn model_tools_soup_delta(args: soup::SoupDeltaArgs) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || soup::soup_delta(args))
        .await
        .map_err(|e| format!("task join error: {}", e))?
}

/// Compress a fine-tune relative to base into a 1-bit `.bitdelta`.
#[tauri::command]
pub async fn model_tools_bitdelta_encode(
    args: soup::BitDeltaEncodeArgs,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || soup::bitdelta_encode(args))
        .await
        .map_err(|e| format!("task join error: {}", e))?
}

/// Reconstruct a fine-tune from base + a `.bitdelta`.
#[tauri::command]
pub async fn model_tools_bitdelta_apply(
    args: soup::BitDeltaApplyArgs,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || soup::bitdelta_apply(args))
        .await
        .map_err(|e| format!("task join error: {}", e))?
}

/// Run the trainer-free GRPO example (developer preview; needs HANZO_ML_DIR).
#[tauri::command]
pub async fn model_tools_grpo_run(args: soup::GrpoRunArgs) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || soup::grpo_run(args))
        .await
        .map_err(|e| format!("task join error: {}", e))?
}
