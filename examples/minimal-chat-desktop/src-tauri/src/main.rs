#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;

#[tauri::command]
fn list_recent_projects() -> Vec<String> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    hanzo_projects::discover(&home)
        .into_iter()
        .take(5)
        .map(|p| p.name)
        .collect()
}

#[tauri::command]
fn find_local_engine() -> Option<String> {
    let override_bin = env::var_os(hanzo_engine_bin::OVERRIDE_VAR);
    let exe_dir = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let path_var = env::var_os("PATH");
    hanzo_engine_bin::resolve(
        override_bin.as_deref(),
        exe_dir.as_deref(),
        path_var.as_deref(),
    )
    .map(|p| hanzo_log_redact::redact(&p.display().to_string()).into_owned())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_recent_projects,
            find_local_engine
        ])
        .run(tauri::generate_context!())
        .expect("error while running starter desktop application");
}
