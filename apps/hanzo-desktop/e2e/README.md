# Hanzo Desktop — real Tauri E2E (WebdriverIO + tauri-driver)

This suite drives the **real, built `hanzo-desktop` binary** over WebDriver. It
opens a native window, runs the production React bundle inside the Tauri webview,
and exercises real `window.__TAURI_INTERNALS__` IPC.

> This is the *real* end-to-end suite. The Playwright specs under
> [`../e2e-tests/`](../e2e-tests) are **frontend smoke only** — they load the
> Vite dev server in headless Chromium with **no Tauri runtime/IPC**. Two
> distinct jobs, one script each:
>
> | script | what it drives | where |
> |---|---|---|
> | `pnpm test:e2e` | the real native app | `e2e/` (this dir, wdio) |
> | `pnpm test:smoke` | the Vite frontend in Chromium | `e2e-tests/` (playwright) |

## How it works

`tauri-driver` is a thin WebDriver proxy. It launches the app binary named in
`tauri:options.application` and bridges WebDriver to the platform webview driver:

- **Linux** → `WebKitWebDriver` (apt package **`webkit2gtk-driver`**)
- **Windows** → `msedgedriver`
- **macOS** → *unsupported* (WKWebView ships no WebDriver; see caveat below)

`wdio.conf.ts` (app root) spawns/kills `tauri-driver` around the session and
points the capability at `src-tauri/target/debug/hanzo-desktop`.

## Prerequisites

1. **tauri-driver** on `PATH`:
   ```bash
   cargo install tauri-driver --locked
   ```
2. **Native webview driver** (Linux):
   ```bash
   sudo apt-get install -y webkit2gtk-driver   # provides WebKitWebDriver
   ```
3. **A debug build of the app** (the binary wdio launches):
   ```bash
   # from apps/hanzo-desktop
   pnpm tauri build --debug
   # or just the Rust binary (frontend dist must already exist):
   cargo build --manifest-path src-tauri/Cargo.toml
   ```
4. A display. Headless CI: run under `Xvfb` (or any X server) and export
   `DISPLAY` (e.g. `:1`).

## Run

```bash
# from repo root or apps/hanzo-desktop
pnpm test:e2e
```

Useful env overrides (all optional):

| var | default | purpose |
|---|---|---|
| `TAURI_DRIVER_PATH` | `tauri-driver` | path to the tauri-driver binary |
| `TAURI_WEBDRIVER_PATH` | `WebKitWebDriver` (Linux) | native webview driver |
| `TAURI_DRIVER_PORT` | `4444` | tauri-driver intermediary port |
| `TAURI_NATIVE_PORT` | `4445` | native driver port |
| `WDIO_LOG_LEVEL` | `warn` | wdio log verbosity |

Example (explicit display + verbose):
```bash
DISPLAY=:1 WDIO_LOG_LEVEL=info pnpm test:e2e
```

## What the specs cover (minimal but real, no mocks)

- `app-load.e2e.ts` — native window opens, React mounts into `#root`,
  `__TAURI_INTERNALS__` is present (proves it's the real app), cold-start lands
  on onboarding.
- `login.e2e.ts` — the onboarding **Login** button is present and enables only
  after the terms checkbox is accepted.
- `models.e2e.ts` — the local **Zen** engine is named on the benchmark surface;
  the chat home mounts its model selector + composer.
- `chat.e2e.ts` — the real chat composer accepts input and submits (starts a
  job). A streamed *assistant reply* additionally needs a running local engine
  (see the note in the spec).
- `mining.e2e.ts` — the mining/wallet panel renders: `mining-page`, on-chain &
  pending balances, the four-tier privacy selector, recent-proofs table.

Surfaces behind `ProtectedRoute` are reached by restoring a **real** persisted
session (`restoreSignedInSession()` in `helpers.ts`) — the same localStorage
envelope the app writes for a returning, signed-in (cloud-mode) user. That is
real app state, not a behavioural mock.

## macOS caveat

There is **no WebDriver for WKWebView**, so `tauri-driver` cannot drive the app
on macOS. Run this suite on Linux (or Windows with `msedgedriver`). On macOS,
use the Playwright frontend smoke (`pnpm test:smoke`) for UI-level coverage.

## Known environment blocker — WebKitGTK ≥ 2.46 (Linux)

`tauri-driver` 2.0.x drives the app through WebKitGTK's WebDriver. On **very new
WebKitGTK** (observed: **2.52.3**, Ubuntu 24.04 arm64) the automation-session
handshake hangs — `tauri-driver` logs `Error serving connection:
hyper::Error(IncompleteMessage)` and the `POST /session` never returns (the app
binary launches fine standalone; the break is the driver↔webview automation
protocol, an upstream change in recent WebKitGTK). Symptom in wdio:
`UND_ERR_HEADERS_TIMEOUT` on session create.

Status of this harness in that environment: **fully wired and config-valid** —
config + specs typecheck (`tsc -p tsconfig.e2e.json`), `tauri-driver` and
`WebKitWebDriver` resolve, the debug binary builds and launches — but the suite
**cannot complete a session until the toolchain catches up**. Mitigations:

- Use a **newer `tauri-driver`** once published with WebKitGTK 2.5x support
  (`cargo install tauri-driver --locked`), or
- Run against an environment with **WebKitGTK ≤ ~2.44**, or
- Run the suite on **Windows** (`msedgedriver`), where this WebKitGTK-specific
  break does not apply.

This is deliberately **not** faked green — the harness is real; the blocker is
upstream and environment-specific.
