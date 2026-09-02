//! Where the app is when no window is.
//!
//! Four verbs, and each one already exists somewhere else: the tray offers
//! them from outside, it does not implement them.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

use crate::{go, raise, services};

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let running = MenuItem::with_id(app, "services", "Local services", true, None::<&str>)?;
    let ask = MenuItem::with_id(app, "ask", "New chat", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &running, &ask, &quit])?;

    let mut tray = TrayIconBuilder::with_id("tray")
        .menu(&menu)
        .show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "show" => raise(app),
        "services" => {
            let _ = services(app);
        }
        "ask" => go(app, "/", None),
        // The only way out: closing the last window leaves the app here.
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}
