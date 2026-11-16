#!/usr/bin/env python3
"""Self-test for check-secret-logging.py: each case is a small Rust snippet."""
import importlib.util
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("csl", os.path.join(HERE, "check-secret-logging.py"))
csl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(csl)

FLAGGED = {
    "multiline_hanzo_log_of_secret_keys": '''
fn f() {
    hanzo_log(
        HanzoLogOption::Node,
        HanzoLogLevel::Info,
        format!(
            "identity sk: {} pk: {} encryption sk: {} pk: {}",
            identity_secret_key_string,
            identity_public_key_string,
            encryption_secret_key_string,
            encryption_public_key_string,
        )
        .as_str(),
    );
}''',
    "debug_of_provider_struct": '''
fn f() {
    hanzo_log(HanzoLogOption::Node, HanzoLogLevel::Info,
        format!("Initial LLM Provider: {:?}", initial_llm_providers).as_str());
}''',
    "pretty_debug_of_env": 'fn f() { log::info!("spawn env {:#?}", env); }',
    "inline_capture": 'fn f() { println!("key {api_key}"); }',
    "eprintln_pem_strings": 'fn f() { eprintln!("key_string: {}", key_string); }',
    "panic_with_key": 'fn f() { panic!("bad {} {}", secret_key_str, computed_sk); }',
    "debug_env_via_iter": 'fn f() { info!("vars {:?}", &env_map.iter().collect::<Vec<_>>()); }',
    "bearer_field": 'fn f() { hanzo_log(a, b, &format!("auth={}", msg.bearer_auth)); }',
}

CLEAN = {
    "public_keys_only": 'fn f() { info!("identity pk: {} encryption pk: {}", identity_public_key_string, encryption_public_key_string); }',
    "provider_ids_only": 'fn f() { info!("providers: {:?}", initial_llm_providers.iter().map(|p| p.id.as_str()).collect::<Vec<_>>()); }',
    "field_of_env_struct": 'fn f() { println!("Node WS address: {:?}", node_env.ws_address); }',
    "length_of_secret": 'fn f() { info!("key present: {}", !api_key.is_empty()); }',
    "allow_marker": 'fn f() { println!( // secret-log-ok: deterministic test keys\n "{}", secret_key); }',
    "test_module": '#[cfg(test)]\nmod tests { fn t() { println!("{}", api_key); } }',
    "tool_router_key": 'fn f() { println!("found tool_router_key: {}", tool_router_key); }',
}


class CheckSecretLogging(unittest.TestCase):
    def scan(self, src):
        with tempfile.NamedTemporaryFile("w", suffix=".rs", delete=False) as f:
            f.write(src)
        try:
            return csl.scan_file(f.name)
        finally:
            os.unlink(f.name)

    def test_flagged(self):
        for name, src in FLAGGED.items():
            with self.subTest(name):
                self.assertTrue(self.scan(src), f"{name} should be flagged")

    def test_clean(self):
        for name, src in CLEAN.items():
            with self.subTest(name):
                self.assertEqual(self.scan(src), [], f"{name} should pass")


if __name__ == "__main__":
    result = unittest.main(verbosity=2, exit=False).result
    cases = len(FLAGGED) + len(CLEAN)
    if not result.wasSuccessful():
        print(f"check-secret-logging self-test: {len(result.failures) + len(result.errors)} tests failed")
        raise SystemExit(1)
    print(f"check-secret-logging self-test: {cases} tests passed")
