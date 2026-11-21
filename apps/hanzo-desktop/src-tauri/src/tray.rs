use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use crate::{
    globals::HANZO_NODE_MANAGER_INSTANCE,
    windows::{recreate_window, Window, show_spotlight_window},
};

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let quit_menu_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let show_menu_item = MenuItemBuilder::with_id("show", "Show").build(app)?;
    let hanzo_spotlight_menu_item = MenuItemBuilder::with_id("hanzo_spotlight", "Hanzo Spotlight")
        .accelerator("CmdOrCtrl+Shift+J")
        .build(app)?;

    let open_hanzo_node_manager_window_menu_item =
        MenuItemBuilder::with_id("open_hanzo_node_manager_window", "Open").build(app)?;
    let hanzo_node_manager_menu_item = SubmenuBuilder::new(app, "Hanzo Node Manager")
        .item(&open_hanzo_node_manager_window_menu_item)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &show_menu_item,
            &hanzo_node_manager_menu_item,
            &hanzo_spotlight_menu_item,
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
                        recreate_window(tray.app_handle().clone(), Window::Main, true);
                    }
                }
            }
        })
        .menu_on_left_click(!cfg!(target_os = "windows"))
        .menu(&menu)
        .on_menu_event(move |tray, event| match event.id().as_ref() {
            "show" => {
                recreate_window(tray.app_handle().clone(), Window::Main, true);
            }
            "open_hanzo_node_manager_window" => {
                recreate_window(tray.app_handle().clone(), Window::HanzoNodeManager, true);
            }
            "hanzo_spotlight" => {
                recreate_window(tray.app_handle().clone(), Window::Spotlight, true);
            }
            "quit" => {
                tauri::async_runtime::spawn(async move {
                    // For some reason process::exit doesn't fire RunEvent::ExitRequested event in tauri
                    let mut hanzo_node_manager_guard =
                        HANZO_NODE_MANAGER_INSTANCE.get().unwrap().write().await;
                    if hanzo_node_manager_guard.is_running().await {
                        hanzo_node_manager_guard.kill().await;
                    }
                    drop(hanzo_node_manager_guard);
                    std::process::exit(0);
                });
            }
            _ => (),
        })
        .build(app)?;
    Ok(())
}
