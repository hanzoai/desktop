#!/usr/bin/env python3
"""Fail if a print/log/panic call formats a secret-bearing value.

Scans every *.rs file under the given roots (default: .). Each macro or
logging call is read as one unit, from its opening parenthesis to the matching
close, so a format!(...) split over several lines is checked as a whole.

A call fails when:
  * an argument (or an inline `{name}` capture) names a secret, e.g.
    identity_secret_key_string, api_key, refresh_token, key_string,
    computed_sk; or
  * it Debug-formats (`{:?}` / `{:#?}`) a value whose name suggests a
    credential-bearing struct (providers, keys, oauth, tokens, env, headers),
    because derived Debug prints every field, `api_key` included.

Code after `#[cfg(test)]`, and tests/, examples/, benches/ and target/ are
skipped. A deliberate exception carries `// secret-log-ok: <reason>` on the
call's first line.
"""
import os
import re
import sys

CALLS = re.compile(
    r"\b(?:println!|eprintln!|print!|eprint!|panic!|unreachable!|todo!|unimplemented!|"
    r"(?:log::|tracing::)?(?:trace|debug|info|warn|error)!|hanzo_log)\s*\("
)
SECRET_PARTS = (
    "secret_key", "private_key", "api_key", "apikey", "secret", "password",
    "passwd", "passphrase", "mnemonic", "seed_phrase", "refresh_token",
    "access_token", "id_token", "auth_token", "bearer", "client_secret",
    "code_verifier", "request_body", "response_json", "https_certificate",
    "certificate_pem", "private_cert",
)
SECRET_EXACT = {"sk", "computed_sk", "secret_key_str", "key_pem", "private_key_pem", "key_string", "custom_headers"}
DEBUG_PARTS = (
    "provider", "credential", "keypair", "node_keys", "oauth", "token",
    "secret", "env", "headers", "auth",
)
# Methods whose receiver is still the whole value (so `env.iter()` dumps env).
PASS_THROUGH = {"iter", "clone", "as_ref", "unwrap", "unwrap_or_default", "to_owned",
                "borrow", "lock", "read", "deref", "collect", "into_iter", "as_deref"}
SKIP_DIRS = {"target", "tests", "examples", "benches", ".git", "node_modules"}
STRING = re.compile(r'r#*"(?:.|\n)*?"#*|"(?:\\.|[^"\\])*"')
IDENT = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
CHAIN = re.compile(r"(?:\.\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:::<[^>]*>)?\s*(?:\((?:[^()]|\([^()]*\))*\))?)*")
PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_.]*)?(:[^}]*)?\}")


def call_span(text, open_paren):
    depth, i, n = 0, open_paren, len(text)
    while i < n:
        c = text[i]
        if c == '"' or (c == "r" and text[i + 1 : i + 2] in ('"', "#")):
            m = STRING.match(text, i)
            if m:
                i = m.end()
                continue
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return text[open_paren + 1 : i]
        i += 1
    return text[open_paren + 1 :]


def is_secret(name):
    n = name.lower()
    if n in SECRET_EXACT:
        return True
    if n.endswith("_sk") or n.startswith("sk_"):
        return True
    return any(p in n for p in SECRET_PARTS)


def check_call(body):
    strings = STRING.findall(body)
    code = STRING.sub(" ", body)
    # `.len()`, `.is_some()`, `.is_empty()` of a secret say nothing about it.
    code = re.sub(r"\b[A-Za-z_][A-Za-z0-9_]*\s*\.\s*(?:len|is_empty|is_some|is_none)\s*\(\s*\)", " ", code)
    args = [a for a in IDENT.findall(code) if a not in {"format", "as_str", "to_string", "clone", "HanzoLogOption", "HanzoLogLevel"}]
    reasons = []
    for a in args:
        if is_secret(a):
            reasons.append(f"formats `{a}`")
    debug = False
    for s in strings:
        for m in PLACEHOLDER.finditer(s):
            name, spec = m.group(1), m.group(2) or ""
            if name and is_secret(name.split(".")[0]):
                reasons.append(f"captures `{{{name}}}`")
            if "?" in spec:
                debug = True
                if name and any(p in name.lower() for p in DEBUG_PARTS):
                    reasons.append(f"Debug-formats `{name}`")
    if debug:
        for m in IDENT.finditer(code):
            a = m.group(0)
            rest = code[m.end():].lstrip()
            if rest.startswith("("):
                continue  # a function or method name, not a value
            if rest.startswith("::"):
                continue  # a path segment (type or module)
            chain = CHAIN.match(rest)
            names = re.findall(r"\.\s*([A-Za-z_][A-Za-z0-9_]*)", chain.group(0)) if chain else []
            if names and not all(n in PASS_THROUGH for n in names):
                continue  # `x.field` / `x.iter().map(..)`: not the whole value
            if any(p in a.lower() for p in DEBUG_PARTS) and not is_secret(a):
                reasons.append(f"Debug-formats `{a}`")
    return sorted(set(reasons))


def scan_file(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    cut = re.search(r"^\s*#\[cfg\(test\)\]", text, re.M)
    if cut:
        text = text[: cut.start()]
    hits = []
    for m in CALLS.finditer(text):
        line_start = text.rfind("\n", 0, m.start()) + 1
        line_end = text.find("\n", m.start())
        first_line = text[line_start : line_end if line_end != -1 else None]
        if "secret-log-ok" in first_line or first_line.lstrip().startswith("//"):
            continue
        if m.group(0).startswith("hanzo_log") and text[line_start:m.start()].rstrip().endswith("fn"):
            continue
        reasons = check_call(call_span(text, m.end() - 1))
        if reasons:
            lineno = text.count("\n", 0, m.start()) + 1
            hits.append((lineno, "; ".join(reasons)))
    return hits


def main(roots):
    failures = []
    for root in roots or ["."]:
        for d, dirs, files in os.walk(root):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for fn in files:
                if fn.endswith(".rs") and not fn.endswith("_tests.rs") and not fn.endswith("_test.rs"):
                    p = os.path.join(d, fn)
                    for lineno, why in scan_file(p):
                        failures.append(f"{os.path.relpath(p)}:{lineno}: {why}")
    if failures:
        print("secret-bearing values are printed or logged:", file=sys.stderr)
        for f in failures:
            print("  " + f, file=sys.stderr)
        sys.exit(1)
    print("check-secret-logging: ok")


if __name__ == "__main__":
    main(sys.argv[1:])
