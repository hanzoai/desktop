//! What leaves this computer in a report (the crash screen's Copy details)
//! passes the one redactor, `hanzo-log-redact`, which also cleans the log.

/// `text` with secrets and personal details removed (`redact_report`).
#[tauri::command]
pub fn report_redact(text: String) -> String {
    hanzo_log_redact::redact_report(&text)
}
