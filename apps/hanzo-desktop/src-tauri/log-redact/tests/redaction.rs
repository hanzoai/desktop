//! Every fixture below is synthetic and assembled at run time, so no
//! secret-shaped literal sits in the repository for scanners to trip on.
use hanzo_log_redact::{redact, scrub_log_dir, scrub_log_file, StreamRedactor, REDACTED};
use std::fs;

/// A realistic PEM body line: 64 chars of mixed-case base64 with digits.
fn b64_line(seed: char) -> String {
    format!("{seed}{}", "aB3+x9/Qz7Kp".repeat(6))[..64].to_string()
}

fn fake_pem(kind: &str) -> String {
    format!(
        "-----BEGIN {k}-----\nMIIEvQ{a}\n{b}\n{c}==\n-----END {k}-----",
        k = kind,
        a = b64_line('Q'),
        b = b64_line('z'),
        c = "Zm9vYmFyYmF6cXV4"
    )
}

fn body_markers() -> Vec<String> {
    vec![format!("MIIEvQ{}", b64_line('Q')), b64_line('z'), "Zm9vYmFyYmF6cXV4==".into()]
}

fn assert_clean(out: &str) {
    for m in body_markers() {
        assert!(!out.contains(&m), "secret body leaked: {out}");
    }
}

#[test]
fn pem_private_key_in_one_message_is_redacted() {
    let msg = format!("key_string: {}", fake_pem("PRIVATE KEY"));
    let out = redact(&msg);
    assert_clean(&out);
    assert!(out.contains(REDACTED));
}

#[test]
fn pem_variants_are_redacted() {
    for kind in ["RSA PRIVATE KEY", "EC PRIVATE KEY", "OPENSSH PRIVATE KEY", "ENCRYPTED PRIVATE KEY"] {
        let pem = fake_pem(kind);
        let out = redact(&pem);
        assert_clean(&out);
    }
}

#[test]
fn pem_with_escaped_newlines_is_redacted() {
    // .secret stores PEMs with literal "\n"; a dump of it must not leak either.
    let msg = format!("PRIVATE_HTTPS_CERTIFICATE={}", fake_pem("PRIVATE KEY").replace('\n', "\\n"));
    let out = redact(&msg);
    assert_clean(&out);
}

#[test]
fn pem_split_across_stderr_lines_is_suppressed() {
    // A sidecar's stderr arrives one line per event: the BEGIN marker, then
    // the base64 body, then END. No single line holds the whole block.
    let mut r = StreamRedactor::new();
    let mut logged = Vec::new();
    let msg = format!("key_string: {}", fake_pem("PRIVATE KEY"));
    for line in msg.lines() {
        if let Some(l) = r.redact_line(line) {
            logged.push(l);
        }
    }
    let after = r.redact_line("[INFO][hanzo-node] Adding 8 Rust tools");
    let joined = logged.join("\n");
    assert_clean(&joined);
    assert_eq!(after.as_deref(), Some("[INFO][hanzo-node] Adding 8 Rust tools"));
}

#[test]
fn certificate_body_split_across_lines_is_not_logged() {
    let mut r = StreamRedactor::new();
    let msg = format!("cert_string: {}", fake_pem("CERTIFICATE"));
    let out: Vec<String> = msg.lines().filter_map(|l| r.redact_line(l)).collect();
    assert_clean(&out.join("\n"));
}

#[test]
fn secret_fields_are_redacted() {
    let v = format!("v{}", b64_line('k'));
    let cases = [
        format!("IDENTITY_SECRET_KEY={v}"),
        format!("ENCRYPTION_SECRET_KEY: {v}"),
        format!("{{\"api_key\":\"{v}\",\"model\":\"x\"}}"),
        format!("\"refresh_token\": \"{v}\""),
        format!("client_secret={v}&grant_type=refresh_token"),
        format!("password = '{v}'"),
        format!("mnemonic: {v}"),
        format!("SECRET_DESKTOP_INSTALLATION_PROOF_KEY: \"{v}\""),
        format!("\"INITIAL_AGENT_API_KEYS\": \"{v}\""),
        format!("Authorization: Basic {v}"),
    ];
    for c in cases {
        let out = redact(&c);
        assert!(!out.contains(&v), "field leaked: {out}");
        assert!(out.contains(REDACTED), "no marker: {out}");
    }
}

#[test]
fn bearer_and_prefixed_tokens_are_redacted() {
    let tail = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
    let cases = [
        format!("Authorization: Bearer {tail}"),
        format!("using sk-{tail}"),
        format!("key hk-{tail}"),
        format!("{}_{tail}", "ghp"),
        format!("AKIA{}", "ABCDEFGHIJKLMNOP"),
        format!("{}.{}.{}", "eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxIn0", "c2lnbmF0dXJlc2lnbmF0dXJl"),
    ];
    for c in cases {
        let out = redact(&c);
        assert!(out.contains(REDACTED), "token kept: {out}");
        assert!(!out.contains(tail) && !out.contains("ABCDEFGHIJKLMNOP") && !out.contains("c2lnbmF0dXJlc2lnbmF0dXJl"), "token leaked: {out}");
    }
}

#[test]
fn hex_and_base58_secrets_are_redacted() {
    let hex: String = "0123456789abcdef".repeat(4);
    let b58: String = "5Kb8kLf9zgWQnogidDA76MzPL6TsZZY36hWXMssSzNydYXYB9KF".repeat(2);
    for c in [format!("sk {hex}"), format!("0x{hex}"), format!("secret {b58}")] {
        let out = redact(&c);
        assert!(!out.contains(&hex) && !out.contains(&b58), "leaked: {out}");
    }
}

#[test]
fn bip39_mnemonic_is_redacted() {
    let phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    let msg = format!("wallet restored from {phrase} ok");
    let out = redact(&msg);
    assert!(!out.contains("absorb abstract"), "mnemonic leaked: {out}");
    assert!(out.contains(REDACTED));
}

#[test]
fn ordinary_lines_are_untouched() {
    for l in [
        "[INFO][hanzo-node] Adding 8 Rust tools",
        "Fetching tools from remote directory: https://store-api.hanzo.ai/store/defaults",
        "Skipping duplicate tool with key: local:::deno:::tool",
        "Context: 4096 tokens",
        "failed to spawn hanzo-engine (hanzo-server): No such file or directory (os error 2)",
        "the user is able to access the about page above",
    ] {
        assert_eq!(redact(l), l);
    }
}

/// The on-disk layout tauri-plugin-log writes: one record per line,
/// `[ts][LEVEL][target] message` plus the triple ideographic space. A sidecar
/// that prints a PEM to stderr yields one record per PEM line.
fn record(level: &str, msg: &str) -> String {
    format!("[2026-11-09 10:00:00][{level}][hanzo-node] {msg}\u{3000}\u{3000}\u{3000}\n")
}

#[test]
fn existing_log_file_is_scrubbed_in_place() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Hanzo Desktop.log");
    let pem = format!("key_string: {}", fake_pem("PRIVATE KEY"));
    let mut content = record("INFO", "starting");
    for (i, l) in pem.lines().enumerate() {
        content += &record("ERROR", l);
        if i == 1 {
            // Another record interleaved mid-block must survive.
            content += &record("INFO", "interleaved");
        }
    }
    content += &record("INFO", "done");
    fs::write(&path, &content).unwrap();
    assert!(scrub_log_file(&path).unwrap(), "file should be rewritten");
    let after = fs::read_to_string(&path).unwrap();
    assert_clean(&after);
    for kept in ["starting", "interleaved", "done"] {
        assert!(after.contains(kept), "lost {kept}: {after}");
    }
    assert_eq!(after.lines().count(), content.lines().count());
    // Idempotent: a clean file is left alone.
    assert!(!scrub_log_file(&path).unwrap());
}

#[test]
fn log_dir_scrub_covers_rotated_files() {
    let dir = tempfile::tempdir().unwrap();
    let pem = fake_pem("PRIVATE KEY");
    fs::write(dir.path().join("Hanzo Desktop.log"), format!("key_string: {pem}")).unwrap();
    fs::write(dir.path().join("Hanzo Desktop_2026-11-09_10-00-00.log"), format!("key_string: {pem}")).unwrap();
    fs::write(dir.path().join("notes.txt"), "untouched").unwrap();
    assert_eq!(scrub_log_dir(dir.path()).unwrap(), 2);
    for e in fs::read_dir(dir.path()).unwrap() {
        assert_clean(&fs::read_to_string(e.unwrap().path()).unwrap());
    }
}

#[test]
fn sidecar_env_dump_is_redacted_but_keeps_ports() {
    // ProcessHandler::spawn logs its env map at INFO.
    let v = format!("k{}", b64_line('e'));
    let msg = format!(
        "[hanzo-node] attempting to spawn process with args [] and env {{\"NODE_API_PORT\": \"9550\", \"INITIAL_AGENT_API_KEYS\": \"{v}\", \"SECRET_DESKTOP_INSTALLATION_PROOF_KEY\": \"{v}\"}}"
    );
    let out = redact(&msg);
    assert!(!out.contains(&v), "{out}");
    assert!(out.contains("\"NODE_API_PORT\": \"9550\""), "{out}");
}

#[test]
fn node_stdout_credentials_are_redacted() {
    let tail = "Q9w8E7r6T5y4U3i2O1p0AaSsDdFf";
    let refresh = format!("r{tail}");
    let cases = [
        format!("OpenAI Provider: \"sk-proj-{tail}\""),
        format!("[OAuth] Refresh request https://oauth2.example.com/token, {{\"client_id\":\"cid\",\"grant_type\":\"refresh_token\",\"refresh_token\":\"{refresh}\"}}"),
    ];
    for c in cases {
        let out = redact(&c);
        assert!(!out.contains(tail), "{out}");
    }
}

#[test]
fn tool_keys_and_paths_are_not_mistaken_for_secrets() {
    for l in [
        "found tool_router_key: local:::hanzo_tools:::hanzo_web_search",
        "[execute_tool] with tool_router_key: local:::__official_hanzo:::hanzo_typescript_unsafe_processor",
        "Node storage path: \"/Users/someone/Library/Application Support/com.hanzo.desktop/node_storage\"",
        "starting app version: 1.1.55",
    ] {
        assert_eq!(redact(l), l);
    }
}

#[test]
fn sidecar_chunk_yields_only_redacted_lines_and_keeps_the_ready_line() {
    // ProcessHandler logs each line and checks the ready signal on what this
    // returns, so the ready-path log can never see a raw line.
    let mut r = StreamRedactor::new();
    let chunk = format!(
        "key_string: {}\nlistening on http://127.0.0.1:3690\n",
        fake_pem("PRIVATE KEY")
    );
    let lines = r.redact_chunk(&chunk);
    assert_clean(&lines.join("\n"));
    assert!(lines.iter().any(|l| l == "listening on http://127.0.0.1:3690"), "{lines:?}");
}

#[test]
fn ready_line_after_split_pem_across_chunks_is_clean() {
    let mut r = StreamRedactor::new();
    let pem = format!("key_string: {}", fake_pem("PRIVATE KEY"));
    let mut seen = Vec::new();
    for l in pem.lines() {
        seen.extend(r.redact_chunk(&format!("{l}\n")));
    }
    seen.extend(r.redact_chunk("listening on http://127.0.0.1:3690"));
    assert_clean(&seen.join("\n"));
    assert_eq!(seen.last().map(String::as_str), Some("listening on http://127.0.0.1:3690"));
}

#[test]
fn pkce_and_oauth_fields_are_redacted_even_when_short_and_alphabetic() {
    for c in [
        "code_verifier=abcdefghijklmnop",
        "\"code_verifier\": \"abcdefghijklmnop\"",
        "pkce_code_verifier: abcdefghijklmnop",
        "client_assertion=abcdefghijklmnop",
        "\"code\": \"abcdefghijklmnop\", \"grant_type\": \"authorization_code\"",
    ] {
        let out = redact(c);
        assert!(!out.contains("abcdefghijklmnop"), "leaked: {out}");
    }
}
