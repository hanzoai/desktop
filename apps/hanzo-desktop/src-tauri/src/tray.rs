use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use crate::windows::{recreate_window, Window};

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let quit_menu_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let show_menu_item = MenuItemBuilder::with_id("show", "Hanzo AI").build(app)?;
    let team_menu_item = MenuItemBuilder::with_id("team", "Hanzo Team").build(app)?;

    // No "Hanzo Node Manager" entry: hanzo-node no longer ships in this app
    // (hanzo_node_manager.rs), so that window starts and stops nothing. Local
    // models are managed from the main window's Local AI manager. No "Hanzo
    // Spotlight" either: its quick ask still sends through that node, so it
    // could only say "Unable to connect" (main.rs no longer creates it).

    let menu = MenuBuilder::new(app)
        .items(&[
            &show_menu_item,
            &team_menu_item,
            &quit_menu_item,
        ])
        .build()?;
    let is_template = cfg!(target_os = "macos");
    let icon = if cfg!(target_os = "macos") {
        tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon-macos.png"))?
    } else {
        app.default_window_icon().unwrap().clone()
    };
    let _ = TrayIconBuilder::with_id("tray")
        .icon(icon)
        .icon_as_template(is_template)
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "windows") {
                if let TrayIconEvent::Click { button, .. } = event {
                    if button == MouseButton::Left {
                        let _ = recreate_window(tray.app_handle().clone(), Window::Main, true);
                    }
                }
            }
        })
        .show_menu_on_left_click(!cfg!(target_os = "windows"))
        .menu(&menu)
        .on_menu_event(move |tray, event| match event.id().as_ref() {
            "show" => {
                let _ = recreate_window(tray.app_handle().clone(), Window::Main, true);
            }
            "team" => {
                let _ = tauri_plugin_opener::open_url("https://hanzo.team", None::<&str>);
            }
            "quit" => {
                // process::exit skips RunEvent::Exit (main.rs), so what that
                // stops is stopped here: a served model would otherwise keep
                // :36900 and its memory after the app is gone.
                crate::commands::local_site::stop_all();
                crate::local_models::stop_all();
                std::process::exit(0);
            }
            _ => (),
        })
        .build(app)?;
    Ok(())
}
