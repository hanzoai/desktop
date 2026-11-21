use hanzo_node_env::*;
use std::collections::HashMap;

/// The node pinned today, which embeds over Ollama's path.
const OLD_NODE: &str = "v1.15.0";
/// The node that embeds over `/v1/embeddings` with a key.
const NEW_NODE: &str = "v1.19.4";
/// A moment to judge expiry against (epoch ms).
const NOW: u64 = 1_800_000_000_000;

/// A token-shaped value assembled at run time, never a real credential.
fn token(tag: &str) -> String {
    format!("eyJ{}.{}.{}", "a".repeat(12), tag.repeat(8), "c".repeat(12))
}

/// The keychain record `src/keychain.ts` writes: the SDK's entries, all strings.
fn record(token: &str, expires_at: Option<u64>) -> String {
    let mut m = serde_json::Map::new();
    m.insert(ACCESS_TOKEN.into(), token.into());
    m.insert("hanzo_iam_refresh_token".into(), "r".repeat(20).into());
    if let Some(at) = expires_at {
        m.insert(EXPIRES_AT.into(), at.to_string().into());
    }
    serde_json::Value::Object(m).to_string()
}

/// The options env as the app builds it today (HanzoNodeOptions defaults on
/// the pinned node, plus a few of the other variables).
fn options_env(url: &str, model: &str) -> HashMap<String, String> {
    HashMap::from([
        ("NODE_API_PORT".to_string(), "3690".to_string()),
        (URL_VAR.to_string(), url.to_string()),
        (MODEL_VAR.to_string(), model.to_string()),
        (SUPPORTED_VAR.to_string(), OLLAMA_SUPPORTED_MODELS.to_string()),
        ("SKIP_IMPORT_FROM_DIRECTORY".to_string(), "true".to_string()),
    ])
}

fn hanzo_options() -> HashMap<String, String> {
    options_env(OLLAMA_EMBEDDINGS_URL, OLLAMA_EMBEDDING_MODEL)
}

// --- the session ------------------------------------------------------------

#[test]
fn a_live_session_yields_its_access_token() {
    let t = token("k");
    assert_eq!(signed_in_key(Some(&record(&t, Some(NOW + 60_000))), NOW), Some(t.clone()));
    // The SDK may leave the expiry out; the token is then taken as live.
    assert_eq!(signed_in_key(Some(&record(&t, None)), NOW), Some(t));
}

#[test]
fn signed_out_yields_no_key() {
    // No record (signed out, or never signed in).
    assert_eq!(signed_in_key(None, NOW), None);
    // A record without a token (a sign-in that has not finished).
    assert_eq!(signed_in_key(Some(r#"{"hanzo_iam_state":"s"}"#), NOW), None);
    // An empty token, a record that is not JSON, a token that is not a string.
    assert_eq!(signed_in_key(Some(&record("", None)), NOW), None);
    assert_eq!(signed_in_key(Some("not json"), NOW), None);
    assert_eq!(signed_in_key(Some(r#"{"hanzo_iam_access_token":7}"#), NOW), None);
}

#[test]
fn an_expired_or_unreadable_expiry_is_signed_out() {
    let t = token("k");
    assert_eq!(signed_in_key(Some(&record(&t, Some(NOW - 1))), NOW), None);
    assert_eq!(signed_in_key(Some(&record(&t, Some(NOW))), NOW), None);
    let bad = format!(r#"{{"{ACCESS_TOKEN}":"{t}","{EXPIRES_AT}":"soon"}}"#);
    assert_eq!(signed_in_key(Some(&bad), NOW), None);
}

#[test]
fn a_token_that_cannot_be_an_env_value_or_bearer_is_refused() {
    for odd in ["two words", "line\nbreak", "nul\u{0}byte", "tab\there"] {
        assert_eq!(signed_in_key(Some(&record(odd, None)), NOW), None, "{odd:?}");
    }
}

// --- the node version --------------------------------------------------------

#[test]
fn only_v1_19_4_and_later_speak_v1_embeddings() {
    for old in ["v1.15.0", "v1.19.3", "1.19.2", "v1.9.99", "v0.99.0", "", "main", "v1"] {
        assert!(!speaks_openai_embeddings(old), "{old}");
    }
    for new in ["v1.19.4", "1.19.4", "V1.19.4", "v1.19.4-rc.1", "v1.20.0", "v2.0.0", " v1.19.10 "] {
        assert!(speaks_openai_embeddings(new), "{new}");
    }
}

#[test]
fn defaults_follow_the_node_version() {
    assert_eq!(default_embeddings_url(OLD_NODE), "https://api.hanzo.ai");
    assert_eq!(default_embedding_model(OLD_NODE), "embeddinggemma:300m");
    assert_eq!(default_supported_models(OLD_NODE), OLLAMA_SUPPORTED_MODELS);
    assert_eq!(default_embeddings_url(NEW_NODE), "https://api.hanzo.ai/v1");
    assert_eq!(default_embedding_model(NEW_NODE), "zen-embedding");
    assert!(default_supported_models(NEW_NODE).starts_with("zen-embedding,"));
}

// --- which URLs may carry the key --------------------------------------------

#[test]
fn only_hanzo_api_over_https_is_trusted_with_the_key() {
    for yes in [
        "https://api.hanzo.ai",
        "https://api.hanzo.ai/",
        "https://api.hanzo.ai/v1",
        "https://api.hanzo.ai/v1/",
        "https://api.hanzo.ai/embeddings",
        "HTTPS://API.HANZO.AI/v1",
        "https://api.hanzo.ai:443/v1",
    ] {
        assert!(is_hanzo_api(yes), "{yes}");
    }
    for no in [
        "http://api.hanzo.ai/v1",
        "https://api.hanzo.ai.example.com/v1",
        "https://api.hanzo.ai@example.com/v1",
        "https://example.com/api.hanzo.ai",
        "https://api.hanzo.ai:8443/v1",
        "http://127.0.0.1:11434",
        "https://api.openai.com/v1",
        "",
        "api.hanzo.ai",
    ] {
        assert!(!is_hanzo_api(no), "{no}");
    }
}

// --- the env the node is spawned with ---------------------------------------

#[test]
fn signed_in_on_the_new_node_the_key_and_v1_settings_are_set() {
    let t = token("k");
    let env = spawn_env(hanzo_options(), Some(&t), NEW_NODE);
    assert_eq!(env[URL_VAR], "https://api.hanzo.ai/v1");
    assert_eq!(env[MODEL_VAR], "zen-embedding");
    assert_eq!(env[API_KEY_VAR], t);
    assert!(env[SUPPORTED_VAR].split(',').any(|m| m == "zen-embedding"));
    // Everything else passes through untouched.
    assert_eq!(env["NODE_API_PORT"], "3690");
    assert_eq!(env["SKIP_IMPORT_FROM_DIRECTORY"], "true");
}

#[test]
fn signed_out_on_the_new_node_there_is_no_key() {
    let env = spawn_env(hanzo_options(), None, NEW_NODE);
    assert!(!env.contains_key(API_KEY_VAR));
    // It still gets the base and model it can use once a key arrives.
    assert_eq!(env[URL_VAR], "https://api.hanzo.ai/v1");
    assert_eq!(env[MODEL_VAR], "zen-embedding");
    // An empty key is no key.
    assert!(!spawn_env(hanzo_options(), Some(""), NEW_NODE).contains_key(API_KEY_VAR));
}

#[test]
fn the_pinned_old_node_is_spawned_exactly_as_before() {
    let t = token("k");
    for key in [None, Some(t.as_str())] {
        let env = spawn_env(hanzo_options(), key, OLD_NODE);
        assert_eq!(env, hanzo_options(), "signed in: {}", key.is_some());
    }
    // An older node's last release before the change is old too.
    assert_eq!(spawn_env(hanzo_options(), Some(&t), "v1.19.3"), hanzo_options());
}

#[test]
fn settings_an_older_install_saved_are_moved_to_v1_and_zen_embedding() {
    let t = token("k");
    // What earlier releases defaulted to, as the Node Manager may have saved it.
    for (url, model) in [
        ("https://api.hanzo.ai", "embeddinggemma:300m"),
        ("https://api.hanzo.ai", "all-minilm:l6-v2"),
        ("https://api.hanzo.ai/", "snowflake-arctic-embed:xs"),
        ("https://api.hanzo.ai/v1/", "zen-embedding"),
    ] {
        let mut options = options_env(url, model);
        options.remove(SUPPORTED_VAR);
        let env = spawn_env(options, Some(&t), NEW_NODE);
        assert_eq!(env[URL_VAR], "https://api.hanzo.ai/v1", "{url} {model}");
        assert_eq!(env[MODEL_VAR], "zen-embedding", "{url} {model}");
        assert_eq!(env[SUPPORTED_VAR], "zen-embedding", "{url} {model}");
        assert_eq!(env[API_KEY_VAR], t);
    }
}

#[test]
fn a_node_pointed_elsewhere_keeps_its_settings_and_never_gets_the_key() {
    let t = token("k");
    for url in ["http://127.0.0.1:11434", "https://api.openai.com/v1", "http://api.hanzo.ai"] {
        let options = options_env(url, "nomic-embed-text");
        let env = spawn_env(options.clone(), Some(&t), NEW_NODE);
        assert_eq!(env, options, "{url}");
        assert!(!env.contains_key(API_KEY_VAR), "{url}");
    }
}

#[test]
fn a_key_in_the_options_is_never_passed_on() {
    // Only the session supplies the key; one smuggled in through options is dropped.
    let mut options = hanzo_options();
    options.insert(API_KEY_VAR.to_string(), token("x"));
    for version in [OLD_NODE, NEW_NODE] {
        assert!(!spawn_env(options.clone(), None, version).contains_key(API_KEY_VAR), "{version}");
    }
    let mut elsewhere = options_env("http://127.0.0.1:11434", "m");
    elsewhere.insert(API_KEY_VAR.to_string(), token("x"));
    assert!(!spawn_env(elsewhere, Some(&token("k")), NEW_NODE).contains_key(API_KEY_VAR));
}

// --- when the node is restarted ---------------------------------------------

/// What the app does on each change of its session record: build the env the
/// node would get now, restart when the running node's key differs.
struct Node {
    version: &'static str,
    running: Option<SpawnedKey>,
    restarts: usize,
    env: HashMap<String, String>,
}

impl Node {
    fn start(version: &'static str, record: Option<&str>) -> Node {
        let env = spawn_env(hanzo_options(), signed_in_key(record, NOW).as_deref(), version);
        Node { version, running: Some(SpawnedKey::of(&env)), restarts: 0, env }
    }

    fn session_changed(&mut self, record: Option<&str>) {
        let next = spawn_env(hanzo_options(), signed_in_key(record, NOW).as_deref(), self.version);
        if needs_restart(self.running.as_ref(), &next) {
            self.running = Some(SpawnedKey::of(&next));
            self.env = next;
            self.restarts += 1;
        }
    }
}

#[test]
fn signed_in_at_start_the_node_starts_with_the_key_and_is_left_alone() {
    let t = token("k");
    let r = record(&t, Some(NOW + 3_600_000));
    let mut node = Node::start(NEW_NODE, Some(&r));
    assert_eq!(node.env[API_KEY_VAR], t);
    assert!(node.running.as_ref().unwrap().is_signed_in());
    // The SDK rewrites the record for other reasons (a refresh lease); same token, no restart.
    node.session_changed(Some(&r));
    assert_eq!(node.restarts, 0);
}

#[test]
fn sign_in_later_restarts_the_node_with_the_key() {
    let mut node = Node::start(NEW_NODE, None);
    assert!(!node.env.contains_key(API_KEY_VAR));
    assert!(!node.running.as_ref().unwrap().is_signed_in());

    // A sign-in writes the record in steps; one without a token yet changes nothing.
    node.session_changed(Some(r#"{"hanzo_iam_state":"s"}"#));
    assert_eq!(node.restarts, 0);

    let t = token("k");
    node.session_changed(Some(&record(&t, Some(NOW + 3_600_000))));
    assert_eq!(node.restarts, 1);
    assert_eq!(node.env[API_KEY_VAR], t);
    assert_eq!(node.env[URL_VAR], "https://api.hanzo.ai/v1");
}

#[test]
fn a_refreshed_token_restarts_and_sign_out_restarts_without_a_key() {
    let first = token("a");
    let mut node = Node::start(NEW_NODE, Some(&record(&first, None)));

    let refreshed = token("b");
    node.session_changed(Some(&record(&refreshed, None)));
    assert_eq!(node.restarts, 1);
    assert_eq!(node.env[API_KEY_VAR], refreshed);

    node.session_changed(None);
    assert_eq!(node.restarts, 2);
    assert!(!node.env.contains_key(API_KEY_VAR));

    // Signed out twice is still signed out.
    node.session_changed(None);
    assert_eq!(node.restarts, 2);
}

#[test]
fn an_expired_session_counts_as_sign_out() {
    let t = token("k");
    let mut node = Node::start(NEW_NODE, Some(&record(&t, Some(NOW + 1))));
    node.session_changed(Some(&record(&t, Some(NOW - 1))));
    assert_eq!(node.restarts, 1);
    assert!(!node.env.contains_key(API_KEY_VAR));
}

#[test]
fn the_pinned_old_node_is_never_restarted_for_a_session() {
    let mut node = Node::start(OLD_NODE, None);
    node.session_changed(Some(&record(&token("k"), None)));
    node.session_changed(None);
    assert_eq!(node.restarts, 0);
    assert!(!node.env.contains_key(API_KEY_VAR));
}

#[test]
fn no_running_node_is_never_restarted() {
    // A node the person stopped, or one that failed to start: the next start
    // reads the session itself.
    let next = spawn_env(hanzo_options(), Some(&token("k")), NEW_NODE);
    assert!(!needs_restart(None, &next));
}
