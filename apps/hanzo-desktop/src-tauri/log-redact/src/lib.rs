//! Stub: pass-through. Tests are written first (see tests/redaction.rs).
use std::borrow::Cow;
use std::path::Path;

pub const REDACTED: &str = "[REDACTED]";

pub fn redact(input: &str) -> Cow<'_, str> {
    Cow::Borrowed(input)
}

#[derive(Default)]
pub struct StreamRedactor;

impl StreamRedactor {
    pub fn new() -> Self {
        StreamRedactor
    }
    pub fn redact_line(&mut self, line: &str) -> Option<String> {
        Some(line.to_string())
    }
}

pub fn scrub_log_file(_path: &Path) -> std::io::Result<bool> {
    Ok(false)
}

pub fn scrub_log_dir(_dir: &Path) -> std::io::Result<usize> {
    Ok(0)
}
