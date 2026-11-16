//! Redaction for everything Hanzo Desktop writes to its log file.
//!
//! The desktop log (`Hanzo Desktop.log` under the OS log directory) receives
//! the app's own `log::*` records **and** every line the bundled sidecars
//! (hanzo-node, the tool runners) print to stdout/stderr. Neither source can be
//! trusted to never print key material, so the log sink itself scrubs:
//!
//! * PEM blocks of any type (private keys, certificates), whole or with
//!   literal `\n` escapes, and an unterminated `BEGIN ... PRIVATE KEY` header;
//! * standalone base64 runs (a PEM body arriving one line per event);
//! * values of secret-named fields (`*_secret_key`, `api_key`, `password`,
//!   `refresh_token`, `client_secret`, `mnemonic`, `authorization`, ...);
//! * bearer tokens and well-known credential prefixes (`sk-`, `hk-`, `ghp_`,
//!   `AKIA`, JWTs, ...);
//! * long hex (raw 32-byte+ secret keys) and long base58 (wallet keys);
//! * runs of 12+ BIP-39 words (wallet mnemonics).
//!
//! [`StreamRedactor`] adds the one thing a per-line filter cannot see: a PEM
//! block split across several stderr events. [`scrub_log_dir`] rewrites log
//! files already on disk, so an upgrade also cleans what older builds wrote.

use coins_bip39::{English, Wordlist};
use once_cell::sync::Lazy;
use regex::{Captures, Regex};
use std::borrow::Cow;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// What every redacted span is replaced with.
pub const REDACTED: &str = "[REDACTED]";

/// How far past a `BEGIN` marker the matching `END` may be.
const PEM_MAX_SPAN: usize = 16 * 1024;
/// A stream that opened a PEM block and never closed it stops being
/// suppressed after this many lines, so one stray header cannot mute a log.
const PEM_MAX_LINES: usize = 256;
/// Minimum run of BIP-39 words treated as a mnemonic.
const MNEMONIC_MIN_WORDS: usize = 12;

static SECRET_FIELD: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?i)(?P<k>\b[a-z0-9_\-]*?(?:secret|private[_\-]?key|key_string|api[_\-]?keys?|apikey|access[_\-]?token|refresh[_\-]?token|id[_\-]?token|auth[_\-]?token|session[_\-]?token|password|passwd|passphrase|mnemonic|seed[_\-]?phrase|certificate[_\-]?pem|https[_\-]?certificate|cookie)\b"?)(?P<sep>\s*[:=]\s*)(?P<v>Some\("[^"]*"\)|"(?:[^"\\]|\\.)*"|'[^']*'|[^\s,&;}\])]+)"#,
    )
    .unwrap()
});

static AUTH_HEADER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?P<k>\b(?:proxy-)?authorization"?\s*[:=]\s*"?)(?P<v>[^"\r\n,}]+)"#).unwrap()
});

static BEARER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]+=*").unwrap());

static KNOWN_TOKEN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r"\b(?:",
        r"sk-[A-Za-z0-9_\-]{16,}",
        r"|hk-[A-Za-z0-9_\-]{16,}",
        r"|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}",
        r"|gh[pousr]_[A-Za-z0-9]{20,}",
        r"|github_pat_[A-Za-z0-9_]{20,}",
        r"|xox[abposr]-[A-Za-z0-9\-]{10,}",
        r"|npm_[A-Za-z0-9]{30,}",
        r"|AIza[0-9A-Za-z_\-]{35}",
        r"|(?:AKIA|ASIA)[0-9A-Z]{16}",
        r"|eyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}",
        r")"
    ))
    .unwrap()
});

static LONG_HEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(?:0x)?[0-9a-fA-F]{64,}\b").unwrap());

static LONG_BASE58: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[1-9A-HJ-NP-Za-km-z]{80,}\b").unwrap());

static BASE64_RUN: Lazy<Regex> = Lazy::new(|| Regex::new(r"[A-Za-z0-9+/]{40,}={0,2}").unwrap());

static UNTERMINATED_PRIVATE_KEY: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[^\r\n\x{3000}]*").unwrap());

static WORD: Lazy<Regex> = Lazy::new(|| Regex::new(r"[a-z]{3,8}").unwrap());

/// Redacts secrets from one log message. Returns the input unchanged (and
/// unallocated) when nothing matched.
pub fn redact(input: &str) -> Cow<'_, str> {
    let mut s: Cow<'_, str> = redact_pem_blocks(input);
    s = apply(s, &UNTERMINATED_PRIVATE_KEY, |_| format!("-----BEGIN PRIVATE KEY----- {REDACTED}"));
    s = apply(s, &AUTH_HEADER, |c| format!("{}{REDACTED}", &c["k"]));
    s = apply(s, &BEARER, |_| format!("Bearer {REDACTED}"));
    s = apply(s, &SECRET_FIELD, |c| {
        let v = &c["v"];
        if v.contains(REDACTED) || v.starts_with("-----") {
            c[0].to_string()
        } else {
            format!("{}{}{REDACTED}", &c["k"], &c["sep"])
        }
    });
    s = apply(s, &KNOWN_TOKEN, |_| REDACTED.to_string());
    s = apply(s, &LONG_HEX, |_| REDACTED.to_string());
    s = apply(s, &LONG_BASE58, |_| REDACTED.to_string());
    s = redact_base64_runs(s);
    redact_mnemonics(s)
}

fn apply<'a>(s: Cow<'a, str>, re: &Regex, f: impl Fn(&Captures) -> String) -> Cow<'a, str> {
    if !re.is_match(&s) {
        return s;
    }
    let out = re.replace_all(&s, |c: &Captures| f(c)).into_owned();
    if out == *s {
        s
    } else {
        Cow::Owned(out)
    }
}

/// Replaces `-----BEGIN X----- ... -----END X-----` (real or `\n`-escaped
/// newlines, any label) with the header, a marker, and the footer.
fn redact_pem_blocks(input: &str) -> Cow<'_, str> {
    const BEGIN: &str = "-----BEGIN ";
    const END: &str = "-----END ";
    if !input.contains(BEGIN) {
        return Cow::Borrowed(input);
    }
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    let mut changed = false;
    while let Some(b) = rest.find(BEGIN) {
        let after_begin = &rest[b + BEGIN.len()..];
        let label_end = match after_begin.find("-----") {
            Some(i) if i <= 64 => i,
            _ => break,
        };
        let label = &after_begin[..label_end];
        let body_start = b + BEGIN.len() + label_end + 5;
        let window_end = (body_start + PEM_MAX_SPAN).min(rest.len());
        let window_end = floor_char_boundary(rest, window_end);
        let Some(e) = rest[body_start..window_end].find(END) else {
            break;
        };
        let footer_start = body_start + e;
        let footer_label_end = match rest[footer_start + END.len()..].find("-----") {
            Some(i) if i <= 64 => footer_start + END.len() + i + 5,
            _ => break,
        };
        out.push_str(&rest[..b]);
        out.push_str(&format!("-----BEGIN {label}----- {REDACTED} -----END {label}-----"));
        rest = &rest[footer_label_end..];
        changed = true;
    }
    if !changed {
        return Cow::Borrowed(input);
    }
    out.push_str(rest);
    Cow::Owned(out)
}

fn floor_char_boundary(s: &str, mut i: usize) -> usize {
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// A standalone run of 40+ base64 characters that contains a digit or `+`
/// (so long CamelCase words and `/`-paths survive) is key or token material.
fn redact_base64_runs(s: Cow<'_, str>) -> Cow<'_, str> {
    let bytes = s.as_bytes();
    let mut hits = Vec::new();
    for m in BASE64_RUN.find_iter(&s) {
        let t = m.as_str();
        let before = if m.start() == 0 { None } else { Some(bytes[m.start() - 1]) };
        let after = bytes.get(m.end()).copied();
        let joins = |c: Option<u8>| matches!(c, Some(c) if c.is_ascii_alphanumeric() || b"_.-:".contains(&c));
        if t.starts_with('/') || joins(before) || joins(after) || t.contains(REDACTED) {
            continue;
        }
        if t.bytes().any(|c| c.is_ascii_digit() || c == b'+') {
            hits.push((m.start(), m.end()));
        }
    }
    if hits.is_empty() {
        return s;
    }
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    for (a, b) in hits {
        out.push_str(&s[last..a]);
        out.push_str(REDACTED);
        last = b;
    }
    out.push_str(&s[last..]);
    Cow::Owned(out)
}

/// Replaces any run of [`MNEMONIC_MIN_WORDS`]+ consecutive BIP-39 English
/// words separated only by whitespace.
fn redact_mnemonics(s: Cow<'_, str>) -> Cow<'_, str> {
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut run: Option<(usize, usize, usize)> = None; // start, end, count
    let bytes = s.as_bytes();
    let flush = |run: &mut Option<(usize, usize, usize)>, spans: &mut Vec<(usize, usize)>| {
        if let Some((a, b, n)) = run.take() {
            if n >= MNEMONIC_MIN_WORDS {
                spans.push((a, b));
            }
        }
    };
    for m in WORD.find_iter(&s) {
        let whole = (m.start() == 0 || !bytes[m.start() - 1].is_ascii_alphabetic())
            && bytes.get(m.end()).map_or(true, |c| !c.is_ascii_alphabetic());
        let is_word = whole && English::get_index(m.as_str()).is_ok();
        if !is_word {
            flush(&mut run, &mut spans);
            continue;
        }
        match run {
            Some((a, b, n)) if s[b..m.start()].chars().all(char::is_whitespace) && !s[b..m.start()].is_empty() => {
                run = Some((a, m.end(), n + 1));
            }
            _ => {
                flush(&mut run, &mut spans);
                run = Some((m.start(), m.end(), 1));
            }
        }
    }
    flush(&mut run, &mut spans);
    if spans.is_empty() {
        return s;
    }
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    for (a, b) in spans {
        out.push_str(&s[last..a]);
        out.push_str(REDACTED);
        last = b;
    }
    out.push_str(&s[last..]);
    Cow::Owned(out)
}

/// Line-at-a-time redaction for a sidecar's output stream. Suppresses every
/// line between a PEM `BEGIN` and its `END` when they arrive as separate
/// events, and applies [`redact`] to everything else. `None` means "drop the
/// line".
#[derive(Default)]
pub struct StreamRedactor {
    in_pem: Option<usize>,
}

impl StreamRedactor {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn redact_line(&mut self, line: &str) -> Option<String> {
        if let Some(n) = self.in_pem {
            if let Some(e) = line.find("-----END ") {
                self.in_pem = None;
                let tail = line[e + 9..].find("-----").map(|i| e + 9 + i + 5).unwrap_or(line.len());
                let rest = line[tail..].trim();
                return if rest.is_empty() { None } else { Some(redact(rest).into_owned()) };
            }
            self.in_pem = if n + 1 >= PEM_MAX_LINES { None } else { Some(n + 1) };
            return None;
        }
        if let Some(b) = line.find("-----BEGIN ") {
            if !line[b..].contains("-----END ") {
                self.in_pem = Some(0);
                let label = line[b + 11..].split("-----").next().unwrap_or("");
                let prefix = redact(&line[..b]).into_owned();
                return Some(format!("{prefix}-----BEGIN {label}----- {REDACTED}"));
            }
        }
        Some(redact(line).into_owned())
    }
}

static RECORD_PREFIX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(?:\[[^\]\r\n]*\]){3} ?").unwrap());

/// Redacts a whole log file's text, one physical line at a time, carrying
/// "inside a PEM block" across lines: between a `BEGIN` and its `END`, any
/// line whose message is pure base64 (the block body, including its short
/// last line) is blanked, while other records interleaved there are kept.
pub fn redact_log_text(text: &str) -> Cow<'_, str> {
    let mut out = String::with_capacity(text.len());
    let mut changed = false;
    let mut in_pem = 0usize; // lines left in an open block; 0 = not in one
    for line in text.split_inclusive('\n') {
        let body_at = RECORD_PREFIX.find(line).map_or(0, |m| m.end());
        let (prefix, body) = line.split_at(body_at);
        let trimmed = body.trim();
        let mut cleaned: Cow<'_, str> = Cow::Borrowed(line);
        if in_pem > 0 {
            if let Some(e) = body.find("-----END ") {
                in_pem = 0;
                let after = body[e + 9..].find("-----").map_or(body.len(), |i| e + 9 + i + 5);
                let footer = &body[e..after];
                let tail = redact(&body[after..]).into_owned();
                let lead = body[..e].trim_end().trim_end_matches(REDACTED).trim_end();
                let lead = if lead.is_empty() { String::new() } else { format!("{lead} ") };
                cleaned = Cow::Owned(format!("{prefix}{lead}{REDACTED} {footer}{tail}"));
            } else if is_pem_body_line(trimmed) {
                in_pem -= 1;
                let ws = &body[body.trim_end().len()..];
                cleaned = Cow::Owned(format!("{prefix}{REDACTED}{ws}"));
            } else {
                in_pem -= 1;
                cleaned = redact(line);
            }
        } else {
            if let Some(b) = body.find("-----BEGIN ") {
                if !body[b..].contains("-----END ") {
                    in_pem = PEM_MAX_LINES;
                }
            }
            if let Cow::Owned(o) = redact(line) {
                cleaned = Cow::Owned(o);
            }
        }
        if *cleaned != *line {
            changed = true;
        }
        out.push_str(&cleaned);
    }
    if changed {
        Cow::Owned(out)
    } else {
        Cow::Borrowed(text)
    }
}

/// A PEM body line: only base64 characters, and either long or carrying a
/// digit / `+` / `/` / `=` (so a short plain word logged mid-block survives).
fn is_pem_body_line(t: &str) -> bool {
    !t.is_empty()
        && t.bytes().all(|c| c.is_ascii_alphanumeric() || b"+/=".contains(&c))
        && (t.len() >= 40 || t.bytes().any(|c| c.is_ascii_digit() || b"+/=".contains(&c)))
}

/// Redacts an existing log file in place. Returns whether it was rewritten.
pub fn scrub_log_file(path: &Path) -> io::Result<bool> {
    let raw = fs::read(path)?;
    let text = String::from_utf8_lossy(&raw);
    let clean = redact_log_text(&text);
    if let Cow::Borrowed(_) = clean {
        return Ok(false);
    }
    let tmp = path.with_extension("log.scrub");
    fs::write(&tmp, clean.as_bytes())?;
    restrict_permissions(&tmp);
    fs::rename(&tmp, path)?;
    Ok(true)
}

/// Scrubs every `*.log` file directly inside `dir` (the live log and any
/// rotated ones). A missing directory is not an error. Returns how many
/// files were rewritten.
pub fn scrub_log_dir(dir: &Path) -> io::Result<usize> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    let mut n = 0;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() && p.extension().map_or(false, |x| x == "log") {
            restrict_permissions(&p);
            if scrub_log_file(&p)? {
                n += 1;
            }
        }
    }
    Ok(n)
}

/// The directory Tauri's `app_log_dir()` resolves to for `identifier`,
/// computable before the app (and its log plugin) starts.
pub fn app_log_dir(identifier: &str) -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        dirs::home_dir().map(|h| h.join("Library").join("Logs").join(identifier))
    } else {
        dirs::data_local_dir().map(|d| d.join(identifier).join("logs"))
    }
}

#[cfg(unix)]
fn restrict_permissions(p: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(p, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_p: &Path) {}
