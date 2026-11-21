# Hanzo Desktop

## Project

Desktop AI agent app. React + Vite + Tauri (Rust backend).

## Structure

```
apps/hanzo-desktop/
  src/               # React frontend: one window, src/main.tsx -> src/host.tsx
  src-tauri/         # Rust Tauri backend
  public/            # Static assets
libs/
  brand-config/      # THE brand table (see "Brand + sign-in")
  hanzo-logo/        # <BrandMark brand/>, the one brand glyph
```

## UI stack

The window is `@hanzo/app`'s, so its components are **@hanzo/gui** (a hard fork of
Tamagui, `@hanzogui/*`) and **@hanzo/ui**, both from npm; the desktop draws its own
few screens (Welcome, Settings, Local AI, the error screen) with the same two. The
runtime config is `apps/hanzo-desktop/gui.config.ts`. There is no local component
library any more: `libs/hanzo-ui` (the `@hanzo/desktop-ui` barrel and its
`gui-repairs`) served only the Spotlight and Node Manager windows and went with them.

gui writes its stylesheet at run time (a `<style data-href="hanzogui-css">`), so
`style-src` must keep `'unsafe-inline'` working. Tauri hashes the inline
`<style>` in `index.html` into `style-src` at build time, and a hash in a
directive switches `'unsafe-inline'` off: the main window then drew every view
unstyled while the same `dist/` rendered correctly in a browser. So
`tauri.conf.json` sets `dangerousDisableAssetCspModification: ["style-src"]`;
scripts keep their hashes and nonces. Check it in the Tauri window, not a
browser: every `<style>` there has a `.sheet`.

### Writing gui — the five traps

@hanzo/gui **silently drops props it does not recognise**. No throw, no type
error — just an element that never got the style or the handler. So:

1. **A green `vite build` proves nothing.** Assert the props reach the DOM: roles,
   aria state, `htmlFor`, fired callbacks (as `developer-mode.test.tsx` and
   `mining-switch.test.tsx` do). `e2e-tests/ui-convergence.spec.ts` checks the built
   bundle boots and paints from gui in Chromium.
2. **Tailwind loses ties.** Tamagui injects its stylesheet at RUNTIME, i.e. after
   the bundled CSS, so a utility class that collides with a gui style prop
   (`w-[500px]` vs Popover's hardcoded `width: 288`) is overridden. Express those
   as gui props; keep only non-colliding utilities as classes.
3. **Floating props move from the child to the ROOT.** Radix puts `side`/`align`
   on Content; gui takes one `placement` on the root — and @hanzo/ui *accepts*
   `align` before discarding it. Radix tooltips default to `top`, gui's popper to
   `bottom`, so hoisted placements are written out explicitly.
4. **Names differ where you would not look.** `delayDuration` → `delay`.
   `[&>div]:` child selectors do not reach gui's indicator (it wraps it in a
   theme span) — `Progress` has `indicatorClassName` for that.
   `lineHeight={1.1}` renders as `1.1px`. Tailwind `sm:` is **`$sm`**: this app
   runs `@hanzogui/config/v5`, whose media keys are `sm`/`md`/`lg`/`xl` (`sm` =
   minWidth 640, the same edge Tailwind uses) plus a `max-*` family. There is no
   `gtSm` in v5 — `$gtSm` is dropped in silence, so it is a trap and not an
   idiom. A media style always beats a base style, so a media default cannot be
   overridden by a plain prop; a component offering one has to stand it down
   explicitly (`DialogFooter` does). Inside a media object only SHORTHANDS type
   (`items`/`justify`, not `alignItems`/`justifyContent`) even though both
   resolve at runtime. On a `ScrollView`, `role` is dropped and
   `accessibilityRole` is what react-native-web emits as the DOM `role`.
5. **`asChild` is press-dead on the web.** A gui composite part composes its
   behaviour as an `onPress`, and `createComponent` only translates that to a DOM
   `onClick` when `asChild` is `'web'` / `'except-style-web'` — see
   `getWebEvents(events, webStyle)` in @hanzogui/web. With a plain `asChild` the
   handler reaches the child as `onPress`, React drops it, and the control is
   inert while looking perfect: the child renders, its own onClick still fires,
   and the dialog never opens or closes. Pass `asChild="web"`.

Testing gui components under jsdom needs `src/test-setup.ts`'s matchMedia (gui
reads it at module load), ResizeObserver (tabs) and IntersectionObserver
(slider) polyfills, and vitest's `server.deps.inline` for `@hanzogui/*` —
externalised, `resolve.alias` never applies and Node's CJS loader hits
react-native-svg's unbuilt TypeScript.

### Every menu in the main window was unclickable, and nothing said so

Measured in Chromium: open a model picker and its rows paint, position correctly
against the trigger, and **cannot be clicked at all** — `getComputedStyle(panel)
.pointerEvents === 'none'`, and `elementFromPoint` over a row returns the page
behind it. Same for the sidebar's `ContextMenu`. Every menu in the converged
shell was decorative.

Cause: `@hanzo/ui`'s `FloatingMenu` portals through `@hanzo/gui`'s `Portal`,
whose host is `pointerEvents="box-none"`. react-native-web implements that as
`pointer-events: none` on the host plus `auto` on its DIRECT child — and
`FloatingMenu` puts a `PortalTheme` wrapper in between, so the `auto` lands on
the wrapper and the panel below inherits `none`. The repair is one inherited
rule in `apps/hanzo-desktop/index.html` (`[role='menu'] { pointer-events: auto }`),
which reaches every menu because there is exactly one menu mechanism here.
Delete it when the upstream Portal stops swallowing its own menus.

Second defect in the same component: `FloatingMenu` focuses its PANEL inside
the same layout effect that computes the panel's position, so at that moment
the panel is still `visibility: hidden` and cannot take focus. A menu opened
from the keyboard therefore left focus on the trigger and the arrow keys went
nowhere. Focus the first `[role="menuitem"]` on open instead, which is what the
ARIA menu-button pattern asks for anyway.

Third: **`tag` is not typed on gui primitives in 8.x.** `<XStack tag="button">`
works at runtime and is a type error, so anything wanting real button semantics
goes through the gui `Button` (which types `aria-*`, `data-*`, `role`,
`tabIndex` fine) rather than a hand-rolled pressable stack.

Fourth, and it is an install fault rather than a code one: the root
`node_modules/@hanzo/ui` symlink once pointed at **8.0.8** while
`apps/hanzo-desktop` resolved **8.0.39**, and the two dists differ (8.0.8 menu
rows are 30px, 8.0.39's are 32 plus a touch-target pad). Both resolve to 8.0.68
today, but keep reading dist from the APP's resolution
(`node -e "require.resolve('@hanzo/ui/package.json')"` run from
`apps/hanzo-desktop`) rather than the hoisted root — the split is a property of
hoisting, not of a particular version, and it comes back silently.

## The main window is hanzo.ai's app

`src/main.tsx` mounts `Host` (`src/host.tsx`), which draws `@hanzo/rooms/App`,
the same component hanzo.ai draws at `/`, `/chat` and `/dev`: the rail of apps,
the sidebar, Chat and Dev in one inset panel. Desktop owns only what a host
owns:

- **The window's bar**: `<App bar={BAR} />`. There is no browser around this
  window, so the app draws the bar one would: the sidebar's toggle, Back and
  Forward through the router below (⌘[ ⌘] on a Mac, Alt+← Alt+→ elsewhere),
  40px tall. macOS paints its traffic lights over the page's top-left
  (`titleBarStyle: Overlay`), so the bar keeps 78px clear there; Windows and
  Linux keep their native title bar above the page and need none. The bar
  carries `data-tauri-drag-region`, which `core:window:allow-start-dragging`
  in capabilities/main.json lets drag the window.
  `e2e-tests/window-chrome.spec.ts` measures it against the Vite frontend.

- **Session**: `@hanzo/iam`'s `IamProvider` with `storage: keychain`
  (`src/keychain.ts`), held in memory only. The one durable sign-in is the
  credentials file the Hanzo CLI keeps (`src-tauri/src/identity.rs`): each launch
  adopts its active identity (`identity_adopt`), a sign-in here files the new one
  there (`identity_file`), so a sign-in here is a sign-in there and the reverse. No
  token in localStorage, so the rooms are told where it is
  (`configure({ session: keychain })`).
- **Proving the packaged app on Linux**: unpack the `.deb` and drive
  `usr/bin/hanzo-desktop` through `tauri-driver` + `WebKitWebDriver` under
  `xvfb-run`, inside `dbus-run-session` with `gnome-keyring-daemon --unlock
  --components=secrets` and scratch `XDG_*_HOME` dirs. Sign in for real: press
  "Sign in with Hanzo", build hanzo.ai/login's address from the request the
  app made (`hanzo_iam_state` and `hanzo_iam_code_verifier` in the webview's
  localStorage, S256), sign a throwaway in there in a browser, and let it return
  to the loopback port the app opened (`http://127.0.0.1:<port>/callback`), which
  hands the code to the window as `hanzo-iam-callback`. The OS opener cannot be
  caught: it goes through the desktop portal, not `xdg-open` on PATH.
- **Sign-in**: the one way is described under "Brand + sign-in": the brand's
  page opens in the system browser, the browser comes back to a loopback port
  the app opened for that attempt, `sdk.handleCallback` exchanges the code, and
  the window reloads at `/`. Signed out, `src/Welcome.tsx` is the whole window.
- **Router**: the window's `history`. `go` (rooms `lib/host`) pushes; `Host`
  re-renders on push, replace and popstate.
- **Other origins**: a link to one opens in the system browser (`outward`), and
  the `away` plugin in `main.rs` turns any navigation off the app's own origin
  into the same, so sign-out or checkout never replaces the app with a page.
- **Look**: `gui.config.ts` is `@hanzo/ui/gui-config`'s `monochrome`, hanzo.ai's
  config, for every window; `main.tsx` loads hanzo.ai's stylesheets in its order.
- **The panels are the app's** (`@hanzo/app` 0.3.124+): a 33px bar for the window (traffic-light
  inset, toggle, Back, Forward, the update mark), then the sidebar and the chat as two
  panels cut by one `pane()`: one colour, one `--pane-gap` under the bar, between them and at the
  edges, the chat's icons in the chat's header. `src/app.css` only sets the dark palette
  (`--pane-*`, scoped to dark; light keeps the app's tokens) and the bar's alignment.
  `e2e-tests/panels.spec.ts` measures the gaps and the colours, `appearance.spec.ts` the contrast.
- **Updates**: `src/update.tsx`, the bar's one control. Once the window is up
  and every 30 minutes it asks the feed (`plugins.updater`); with a newer
  version the bar says "Update available" and nothing else moves. One press
  downloads, stops a served model and calls off a download, installs and
  relaunches (Windows' installer restarts itself). A failed install says so and can be pressed again. The old banner lives
  in the retired layout and is not mounted here.
- **Developer mode**: the window's own `/settings` page (`DesktopSettings`) holds
  the same switch as the account card, the palette (⌘K), ⌘⇧D and a run's menu:
  `@hanzo/build/dev-mode`'s `hanzo.dev_mode`, off for a new person. The app's own
  Settings pages are not reachable from this window, so a switch only drawn there
  would not be found.

The stack is pinned in `pnpm-workspace.yaml`'s catalog to the versions
hanzo-inc/app pins. Move them together.

## Commands

```bash
npx nx serve hanzo-desktop     # Dev (Tauri, uses tauri.conf.local.json)
npx nx build hanzo-desktop     # Production build
npx nx test hanzo-desktop      # Vitest
npx nx lint hanzo-desktop      # ESLint
npx nx run hanzo-desktop:typecheck
npx nx run hanzo-desktop:cargo-check
```

Alternative: `cd apps/hanzo-desktop && npm run dev|build|lint`

## Code Style

- 2 spaces, Prettier + Tailwind plugin, single quotes
- Files/dirs: kebab-case. Components/types: PascalCase. Vars/functions: camelCase
- Tests: Vitest + @testing-library/react, co-located in `__tests__/`, `*.test.ts(x)`
- Commits: Conventional (`feat:`, `fix:`, `chore:`, `docs:`)

## Tooling

- Node 20+, npm 10+, Rust toolchain for Tauri
- `postinstall` runs `patch-package`
- Env: copy `.env.example`, never commit secrets

## No sidecars, no bundled model

The bundle is the app alone: `tauri.conf.json` declares no `externalBin` and no
`resources`. The hanzo-node sidecars and the 584 MB embedding model it read left
with the node; `download-binaries.sh` and `pins` are gone, and neither release
workflow fetches or copies anything beside the app.

## Two TypeScripts

Which one is the CHECKER: `pnpm typecheck` runs
**7.0.2**, the compiler rewritten in Go, invoked BY PATH
(`node ../../node_modules/typescript-7/bin/tsc`) — two packages here ship a `tsc`
and which one wins `node_modules/.bin` is pnpm's business, not ours.

The plain `typescript` stays at **5.9.3** because 7 has no JavaScript compiler
API — it ships a binary and exports a version string, with an `unstable/ast` that
has type guards and a token scanner but no `createSourceFile`. `eslint.config.mjs`
reaches typescript-eslint, which *refuses* 7 by version check at module load, so
7 under that name turns `pnpm lint` from exit 1 (findings) into exit 2 (crashed).
7 checks, 5 parses; when typescript-eslint ships support, `typescript` moves to 7
and the alias goes. Do NOT add `@typescript/native-preview` — it is the
pre-release channel of the same binary, behind stable.

## The log file is redacted at the sink

`Hanzo Desktop.log` (Tauri `app_log_dir()`: `~/Library/Logs/<identifier>/` on
macOS, `<data_local_dir>/<identifier>/logs/` on Linux and Windows) receives the
app's own `log::*` records. The sink never trusts its input:

- `src-tauri/log-redact` (crate `hanzo-log-redact`, pure Rust) is the one
  redaction layer. `redact()` runs inside the tauri-plugin-log `format`
  closure in `main.rs`, so every record passes it. It removes PEM blocks,
  standalone base64 runs, secret-named fields, bearer/API tokens, long hex and
  base58, and 12+ word BIP-39 runs.
- `scrub_log_dir()` runs in `main()` before the log plugin opens the file and
  rewrites any `*.log` still holding such material (idempotent; files also get
  mode 0600 on Unix). Upgrading cleans what older builds wrote.
- `redact_report()` is the same redaction plus what is personal (home-folder
  names, quoted text), for what leaves the computer: the crash screen's Copy
  details goes through it (`report.rs` `report_redact`).

`cargo test --manifest-path apps/hanzo-desktop/src-tauri/log-redact/Cargo.toml`
is a `hanzo.yml` gate. Add a fixture there for any new secret shape; keep
fixtures synthetic and assembled at run time.

- OAuth/PKCE fields (`code_verifier`, `code_challenge`, `client_assertion`,
  `authorization_code`, and a bare `code` inside a `grant_type`/`redirect_uri`
  exchange) are redacted like any other secret field.

### Secret-logging check

`scripts/check-secret-logging.py` (gate `no-secret-logging`) scans whole macro
calls, so multiline `log!`/`println!` calls are covered, and flags Debug
formatting (`{:?}`) of credential-like values (provider, credential, keypair,
token, env, headers, auth...). Test code and `tests/` are skipped. A deliberate
exception needs `// secret-log-ok: <reason>` on the line. Its self-test,
`scripts/test_check_secret_logging.py`, holds the shapes it must keep catching.

## Release Pipeline

### Workflows

**The gate** is `.github/workflows/cicd.yml`: it calls the `hanzoai/ci` reusable on
push to main, on a pull request, and on both tag shapes this repo has used (`v*` and
a bare `1.1.48`). Every knob lives in `/hanzo.yml`, which declares `test:` and
nothing else; the real gate is `pnpm typecheck` plus `scripts/version.sh check`.

**The release lane** is two workflows, split so a missing Mac never holds back the
rest:

- `desktop-release.yml` — on a `v*` tag, builds Linux amd64 and arm64
  (AppImage, deb, rpm) and Windows x64 (NSIS setup.exe, portable zip) on
  `heavy-linux-{amd64,arm64}` runner pods, uploads each leg's assets straight to the
  GitHub release (a draft until every leg is in), then writes `SHA256SUMS` and
  `latest.json` and publishes. The tag must equal `v` + the root `package.json`
  version. A pull request that touches the lane, or Run workflow on a branch, is a
  dry run: same builds, same uploads, against a draft release named
  `dry-run-<run id>` that the last job deletes. Run workflow on a tag cuts that tag
  again.
- `desktop-release-macos.yml` — builds the `aarch64`, `x64`, and `universal` `.dmg`
  installers plus the `universal` `.app.tar.gz` updater archive on GitHub-hosted
  `macos-15` runners, attaches them to the same release, and recomputes the manifest,
  which then gains the darwin platforms. The host needs Xcode's command line tools
  and `jq` (macOS 15 ships it); the app is ad-hoc signed, not notarized.

### macOS signing: ready for notarisation, short of the Developer ID

Tauri signs the `.app` under the hardened runtime (`bundle.macOS.hardenedRuntime`,
default on) with `src-tauri/entitlements.plist`, named once, in
`tauri.macos.conf.json`. That file holds one key, `device.audio-input`, for
dictation and talk mode; everything else it carried was sandbox-only (no effect
without `app-sandbox`), unreached (camera, location), or deno's (gone with the
sidecars). There is no debug entitlements file because nothing needs one: `tauri
dev` does not codesign, so a dev binary has no hardened runtime to attach past, and
`get-task-allow` in a release is a notary rejection.

Tauri signs every `externalBin` with that same file (tauri-bundler `sign.rs`), so a
sidecar cannot be given entitlements of its own; the bundle ships none. `Info.plist`
carries a usage sentence for exactly the protected resources the app reaches
(microphone; speech recognition, which `@hanzo/voice` falls back to when the
platform transcriber refuses and which WebKit refuses without the sentence; local
network; Documents, Desktop, Downloads), none naming a
brand, since every brand ships the one file. There is no `NSBonjourServices`:
LAN discovery is `mdns-sd`, which multicasts on its own sockets rather than
through Apple's Bonjour APIs, so only the local-network sentence applies (Apple
TN3179, rev. 2026-10-06; the multicast entitlement is not required on macOS).

`scripts/check-macos-signing.py` (gate `macos-signing`, with its self-test) refuses
any drift from that. `desktop-release-macos.yml` and `scripts/local-build.sh` run it
before the build and again with `--app` on the signed bundle, which reads what
`codesign` actually signed in and holds it to the file, hardened runtime included. What is left is Hanzo's: a Developer ID Application
certificate and an App Store Connect API key in KMS `/desktop`, and the
`APPLE_SIGNING_IDENTITY: '-'` line in `desktop-release-macos.yml` replaced by them.
Tauri then notarizes and staples the `.app`; the `.dmg` is notarized and stapled
after it.

`scripts/release/` is the lane's whole logic, and each script says what it does at
its head: `meta.sh` (which release, creates the draft), `sysroot.sh`, `rust.sh`,
`prepare.sh`, `kms.sh`, `signing.sh`, `stage.sh`, `verify.py`, `manifest.sh`,
`gh.sh`. The runner has no sudo and no apt (visor ignores setuid), so the Linux
build libraries are `apt-get download`ed as the runner user and unpacked into a
prefix under the job. `gh` is not on the image; `gh.sh` is curl and jq.

Asset names are what hanzo.ai's `scripts/sync-releases.mjs` resolves:
`Hanzo_Desktop_<v>_{amd64,arm64}.{AppImage,deb}`, `Hanzo_Desktop-<v>-1.{x86_64,aarch64}.rpm`,
`Hanzo_Desktop_<v>_x64-setup.exe`, `Hanzo_Desktop_<v>_x64-portable.zip`,
`Hanzo_Desktop_<v>_{aarch64,x64,universal}.dmg`, `Hanzo_Desktop_<v>_universal.app.tar.gz`,
each updater bundle with a `.sig`, plus `SHA256SUMS` (from the sha256 digest GitHub
computes; `manifest.sh` waits until every asset has one, since GitHub adds it a moment after an upload) and
`latest.json`. Change a name and the download page loses a tile.

`bundle.linux.rpm.compression` in `apps/hanzo-desktop/src-tauri/tauri.conf.json`
is `{"type": "none"}` because of what the bundle once carried; the model below no
longer ships, so with the app alone a compressed rpm is cheap again and the
setting can be revisited. The cause, while `@tauri-apps/cli` bundles `rpm 0.16.0`:
`rpm 0.16.0`'s `Sha256Writer::write` hashes the entire input slice before forwarding to
`Compressor::write`, which only consumes one 32–128 KB stream chunk per call on
compressed encoders — which turned the 584 MiB `embeddinggemma-300M-BF16.gguf` resource
into multi-terabyte O(N^2) SHA-256 hashing and corrupting `RPMTAG_PAYLOADDIGEST`.
`Compressor::None(Vec<u8>)` consumes the slice in a single call (~850 MiB `.rpm`,
valid payload digest, seconds to bundle).

### The updater key

Updater bundles are signed with a Tauri (minisign) key pair made 2026-11-08; the old
key (id 189DA78B3D6E3032) was lost, so installs of 1.1.54 and earlier carry a public
key nothing can sign for and cannot auto-update: they reinstall once. The public key
is `plugins.updater.pubkey` in `tauri.conf.json` (key id 704F82A3E95CC96F). The
private key and its password are in Hanzo KMS, org `hanzo`, env `prod`, path
`/desktop`, names `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
The CI identity reads them through a grant in universe `kms-grants.yaml`. Rotating is
`tauri signer generate`, `hanzo kms secrets create --as hanzo --env prod --path /desktop
--name <NAME> --value <value>` for both, and the new pubkey in the config; every
install then has to be a build carrying it. `scripts/release/verify.py` checks every
bundle's signature against the config's pubkey before anything uploads.

`createUpdaterArtifacts` is `true`, not `v1Compatible`: the AppImage and the NSIS
setup are signed themselves, so there is no second 600 MB `.tar.gz` per platform.

### Troubleshooting
- A release that stays a draft: a leg failed. Re-run the failed jobs; the release job
  publishes once Linux and Windows are all in.
- Windows is cross-built on Linux (cargo-xwin, makensis, clang-cl); it needs no Windows host.
- `VITE_POSTHOG_API_KEY` and `SECRET_DESKTOP_INSTALLATION_PROOF_KEY` are optional and
  unset in release builds; PostHog is off and the proof key is the compiled default.

## Browser (the user's real one, over ZAP)

`src-tauri/src/commands/browser.rs`. `main` calls `zapd::embed()`, so Desktop
stands for this user's ZAP router beside every hanzo-mcp process; the
browser works with or without one running. The Hanzo extension registers as
`browser/<host>/<engine>-<id>`.

No window calls it: it is plain Rust that `local_site` uses for a capture's
screenshot (no Tauri command).

- `browsers()` — the registered browsers: `{id, caps, attrs}`.
- `browser(method, params)` — routes to the first one. `method` is the
  extension's (`hanzo.snapshot`, `hanzo.act` + `op`, `hanzo.read`,
  `hanzo.screenshot`, `Runtime.evaluate`, `hanzo.navigate`,
  `Target.getTargets`/`createTarget`/`closeTarget`); `params` are strings.
  Returns the JSON answer; `ERR:<why>` from the browser becomes the error.
- Unix only (zapd is fcntl + UDS). Pinned by git tag: crates.io stops at 1.1.2,
  before the extension joined the door without pairing.
- Test: `cargo test --bin hanzo-desktop commands::browser` runs a router under a
  temp `XDG_RUNTIME_DIR`/`XDG_STATE_HOME` with a fake `browser/` node.

## Local runs: Dev in a folder, no terminal

Dev's New starts on **This computer** (`desktopLocal()` in `@hanzo/app` `lib/local-fs.ts`, handed to
`@hanzo/build` as `Host.local`). A run is the `dev` agent in one folder (`dev exec -C <folder>`), no
repository, nothing sent to the platform. The window supplies four commands
(`src-tauri/src/commands/local_workspace.rs`), each its own `allow-` entry in `capabilities/main.json`:

- `local_workspace_open_dialog` — the OS folder dialog.
- `local_workspace_discover` — the project folders found where people keep them (`~/code`, `~/dev`, `~/src`,
  `~/Projects`, `~/work`, `~/git`, whichever exist: at most two folders down, never inside another project,
  never hidden or generated; names and times only, no file is read), newest first, at most 50. Documents and
  Desktop are deliberately not read (macOS asks permission the first time an app looks in them); a project
  kept elsewhere is found once it has been opened in Hanzo. The logic is the `hanzo-projects` crate
  (`src-tauri/projects`); `desktopLocal()` asks once when Dev opens and merges the answer after the
  folders Hanzo opened, so Auto has folders to pick from on a first run.
- `local_workspace_run_dev` — runs the agent with `--color never --skip-git-repo-check -s workspace-write
  -C <folder> -o <file> -- <prompt>` and answers `{session_id, output, process, success}`: `output` is the
  agent's final message (`-o`, else stdout), `process` its log (stderr). `-s workspace-write` is passed
  because `dev exec` otherwise runs read-only and cannot edit. The window shows `output` in words and
  `process` only in Developer mode (`@hanzo/build` `plainAnswer`, `RanHere`).
- **The agent is fetched when the computer has none**, so a person never meets `npm install`. Lookup
  (`hanzo-dev-agent` crate, `src-tauri/dev-agent`): `HANZO_DEV_BIN`, `~/.local/bin/dev`,
  `~/.cargo/bin/dev`, `PATH`, then the app's own copy in the app data dir
  (`<data>/dev/<version>/dev`). None found: download `hanzoai/dev-v1`'s pinned release (the terminal agent; `hanzoai/dev` is the app) (`VERSION` in
  `dev-agent/src/lib.rs`, the one place it is written; `dev-<target>.tar.gz`, Windows
  `dev-x86_64-pc-windows-msvc.exe.zip`, ~120 MB), check it against the `.sha256` beside it, unpack the one
  binary, let older versions go. The window hears `local-dev-setup` `{percent}` (0-100) while it
  downloads and says "Setting up Hanzo Dev on this computer…". One download at a time; a failure is a
  plain sentence the window shows as it is (no connection, a download that did not check out). Move the
  pin by changing `VERSION` and running `cargo test --manifest-path src-tauri/dev-agent/Cargo.toml`.
- `local_dev_setup_cancel` — calls the first-run download off. It answers whether one was in flight (false: none,
  or it had already arrived, since checking and unpacking are local and quick). A cancel stops the request or
  the stream at once (every wait on the network also waits on the cancel), removes the partial file, and sends
  no more `local-dev-setup`; the run that was waiting fails with exactly `Setup was cancelled.`
  (`SETUP_CANCELLED`), which the window shows as "cancelled", not as an error to retry.
- **Windows** is `dev-x86_64-pc-windows-msvc.exe.zip` (one file, a 370 MB `.exe`), unpacked to `dev.exe`; there
  is no windows-arm64 asset in hanzoai/dev-v1's release. The agent is started with `CREATE_NO_WINDOW`. Nothing
  here is run on a Windows host: CI type-checks the pure crates (and their tests) for
  `x86_64-pc-windows-msvc` (`hanzo.yml` `windows-cross-check`, `cargo check --tests`, no linker needed), and
  the release lane's cross-build (cargo-xwin) compiles the app itself.

Auto (the Folder pill) is `@hanzo/build` `route(folders, ask)`: the folder whose name the ask says, then the
folders it sits in, else the folder used last; same words, same folder, a tie goes to the more recent. The
pill reads `Auto · <folder>` as the ask is typed, and a folder the person chose is never moved by the words.

## Let the web use a folder of this computer (hanzo-inc/app#310)

A run started from hanzo.app on a machine linked with `hanzo link` works in a folder of it only inside one the
machine's owner granted (cloud `apps/agents/folders.go`: `POST|GET|DELETE /v1/agent/targets/:id/folders`, the grant
and the revoke the owner's alone, 403 to anyone else, an org admin included). The window grants from Settings →
Machines (`@hanzo/build` `settings/shared.tsx`): the machine that is this computer, found by its hostname, has **Let
the web use a folder…**, which opens the OS folder dialog (`local_workspace_open_dialog`) and grants the folder chosen
with the window's own session; every machine lists its shared folders with **Stop sharing**. A refusal is shown as
the platform says it. The hostname is `@hanzo/app` `desktopLocal().host` (0.3.143+), the os plugin's `hostname` (`os:allow-hostname` in
`capabilities/main.json`), the same name `hanzo link` registers the machine under. `e2e-tests/share-folder.spec.ts`
drives it against a stand-in IPC and a stubbed platform. A computer
that is not linked has no machine to share from: link it with `hanzo link` first. Grants are unix paths; a Windows
folder is refused by the platform, said as it comes.

## Redesign a site: open it, critique it, rebuild it, watch it live (hanzo-inc/app#312)

A person pastes a site's address in Dev's New on This computer (or picks **Redesign a site…**). The agent that
rebuilds it has no network, so the window does what the agent cannot
(`src-tauri/src/commands/local_site/`, each command its own `allow-` entry in `capabilities/main.json`;
`@hanzo/app` `lib/local-site.ts` `desktopSite()` is `@hanzo/build`'s `Host.site` over them, `site.ts` there is the
contract and the prompt the agent is given):

- `local_site_folder(name)` names a new folder `~/Hanzo/<name>` (`-2`, `-3`… when taken) and makes
  nothing: a site that will not open leaves no folder behind. A folder the person chose is built in instead.
- `local_site_capture(url, dir)` opens the site from this computer's connection (`fetch.rs`) and saves
  `<dir>/.hanzo/reference/` (`page.rs`): `page.html`, `text.md` (address, description, words in reading order,
  pictures), up to six `style-N.css`, and `screenshot.*` when a paired browser can take one. Each capture replaces
  the last. **What it will open:** http and https only, no login in the address. Any public address; and an address on this
  computer or a private network (`localhost`, a loopback address, 10/8, 172.16/12, 192.168/16, 100.64/10, IPv6
  unique-local) **only when the person typed it themselves**, as a redesign of a local dev server needs: a bare
  `192.168.1.5:3000` gets `http://`. A redirect from a public site never reaches a private address (each hop
  is judged again, and what the page that was reached may ask for is judged by what the person typed), and a
  public name that answers a private address (DNS rebinding) is refused; only `localhost` and `*.localhost` may
  answer loopback, so a LAN host is typed as its number. Link-local (169.254/16, the cloud metadata address,
  fe80::/10), unspecified, multicast, broadcast and reserved addresses are never opened, typed or not. A name is
  resolved here, every address judged, and the request pinned to the one that passed.
  15 seconds, 5 MB a page, 600 KB a stylesheet, six redirects, HTML only. The picture is best effort over ZAP
  (`commands/browser.rs`: open the page in a tab, wait for `document.readyState`, `hanzo.screenshot`, close the
  tab); no browser paired, or Windows (no ZAP bridge), means no picture and no failure.
- `local_preview_start(dir)` serves `<dir>/redesign` (`preview.rs`) on `127.0.0.1` on a free port: GET and HEAD,
  files under the folder only (a climbing path, NUL, backslash or a link out is refused), only for a `Host` that
  is its own address (a name a web page controls pointing at it is refused), and a server-sent event stream
  (`/__hanzo/events`) that every HTML page's injected script listens on: a file added, changed or removed reloads
  the page. Until `index.html` exists it answers "Hanzo is building your new design" and the same script swaps it
  for the real one. The same folder is the same address while it runs. Previews stop when the main window is
  destroyed, and on exit; `local_preview_stop(dir)` stops one.
- `local_preview_open(url)` shows a preview in Chrome (macOS `open -a "Google Chrome"`, Windows and Linux Chrome
  or Chromium by path), else the default browser. It opens only a preview this app is serving.

The agent is the ordinary `local_workspace_run_dev`: it reads `.hanzo/reference`, answers with a critique and writes
static files into `redesign/`; the preview follows each file it saves, and later runs in that folder (Auto picks it
next) show live in the same tab. Verify the Rust side with `cargo test --bin hanzo-desktop local_site` (the whole
default-feature suite compiles: `cargo test --bin hanzo-desktop`).

## Brand + sign-in (the ONE standard)

`libs/brand-config/src/index.ts` is **THE** brand table. Nothing brand-varying
may be written anywhere else. `getBrand()` resolves `VITE_BRAND` (exported by
`scripts/brand-build.cjs`, which also swaps the Tauri identifier, icons and
deep-link scheme) → hostname → hanzo. The app-local tables that used to compete
with it — `src/brand.config.ts` and `src/config/brand.ts` — are deleted. The
latter's only live fields were `name`, `productName` and `company`: three
spellings of one value, all now `getBrand().name`. Its `appId` was a THIRD
bundle identifier nothing read.

| brand | IdP | client | callback event | identifier |
|---|---|---|---|---|
| hanzo | https://hanzo.id | `hanzo-app` | `hanzo-iam-callback` | `com.hanzo.desktop` |
| lux | https://lux.id | `lux-app` | `lux-iam-callback` | `com.lux.desktop` |
| zoo | https://zoolabs.id | `zoo-app` | `zoo-iam-callback` | `com.zoo.desktop` |

Every brand's redirect is the loopback port of the attempt: `host.tsx` sets it
on the SDK before the authorize request is built, whatever `iam.redirectUri`
the table holds (Lux's and Zoo's still name their deep links there).

- **Login**: `host.tsx` `signIn` — OAuth 2.0 code + PKCE (S256) through the
  `@hanzo/iam` SDK, public client, no secret. The redirect is a loopback port the
  system picks for the attempt (RFC 8252 §7.3, `loopback.rs`); the wait, the
  deadline and Cancel are `src/lib/sign-in-attempt.ts`.
- **Callback**: `src-tauri/src/loopback.rs` answers the first request to
  `/callback` that names a state, emits it as the event the window named (one
  of `<brand>-iam-callback`, never an arbitrary name), and closes the port. The
  browser's page says to return to the app to finish; the exchange happens
  there. `deep_links.rs` still turns a `<scheme>://oauth/<brand>` link into the
  same event, but nothing sends one now: it is a leftover, not a second way in.
- **Mark**: `libs/hanzo-logo` `<BrandMark brand/>` is the only brand glyph. Do
  NOT use `@hanzo/ui`'s `BrandMark` — it white-labels the wordmark text only and
  always paints the Hanzo block-H.
- **Secrets**: never in localStorage. The session is in memory and the shared
  CLI credentials file (above). The browser's hand-back reaches the window on a
  loopback port (`loopback.rs` `iam_loopback`, granted to the window's own pages
  only), emitted as the event the window names, one of `<brand>-iam-callback`;
  `deep_links.rs`'s brand list is tested against this table.
- **Identifier**: one per brand (`ai.hanzo.desktop`, `com.zoo.desktop`,
  `com.lux.desktop`), written in the brand table, `tauri.conf.json` (hanzo's)
  and `tauri.conf.<brand>.json`, and nowhere else. `Info.plist` carries no
  `CFBundleIdentifier`: tauri-bundler merges that file OVER the plist it
  generates, so one there replaced the config's identifier wherever nothing
  patched it: the `.local` build, the `.dev` build and plain `tauri dev` were
  all `ai.hanzo.desktop` to macOS, sharing its WebKit storage, preferences and
  microphone grant (brand builds escaped only because `brand-build.cjs`
  rewrote the key, a second copy of the identifier that is now gone too). Because the data folder, the log file name and the `.app`
  name derive from the running bundle's identity, a disagreement strands what a
  person kept when they move between build variants.
  `src/lib/brand-identity.test.ts` asserts the configs and the table agree and
  that `Info.plist` has no identifier; the `.dev` / `.local` variants keep
  their own suffixed identifier so side-by-side installs don't collide.

Verify a brand end to end with the production bundle:

```bash
VITE_BRAND=zoo pnpm exec vite build
pnpm exec vite preview --port 14200 --strictPort &
VITE_BRAND=zoo PLAYWRIGHT_BASE_URL=http://localhost:14200 \
  pnpm exec playwright test brand-sign-in     # asserts host/client/redirect/PKCE + mark
```

### Gotchas verified the hard way

- **Commands are permissions.** `src-tauri/build.rs` reads `generate_handler![...]`
  in `src/main.rs` and registers every command as an app manifest, so each has an
  `allow-<command>` permission (kebab-case: `hanzo_node_spawn` is
  `allow-hanzo-node-spawn`) and a window calls only what its capability grants.
  Without that, Tauri v2 lets every window call every command. `main.json` grants
  all of them, and the build refuses one it misses or a grant no handler serves.
  The main window is the only window and `main.json` its one capability. It lists
  no remote origin, so a page from another origin (a hanzo.ai frame in the window)
  reaches no command and no plugin; the window never shows one itself (`away` in
  `main.rs`). `src-tauri/src/capabilities_test.rs` resolves the built ACL as Tauri
  does and proves it: nothing is granted to a remote origin, and the sign-in
  (`identity_*`, `iam_loopback`), `report_redact`, mining and `local_models_*` are
  granted to the window's own pages. The old `commands.allow` key was inert (not in the v2 schema) and
  is gone.
- `pnpm build:ci`'s `tsc` step is a **no-op**: `tsconfig.json` has
  `files: []` + `include: []` and only `references`, so plain `tsc` checks
  nothing. Real typecheck is `pnpm typecheck` (`-p tsconfig.app.json`), which puts
  TypeScript 7 over the app's sources and comes back **clean** — 0 errors. It was 59, then 47 through the
  eleven-primitive migration; the gui shorthand style props behind those resolve
  against the 8.2.1 / `@hanzo/ui` 8.4.13 types. So a non-zero count is now a
  regression to fix, not a baseline to compare against.
- `pnpm-workspace.yaml` is BOTH things at once, and needs to stay both. It is
  pnpm 11's **config home** (overrides, shamefullyHoist, allowBuilds — pnpm 11
  stopped reading them from .npmrc) *and* a workspace manifest declaring
  `packages: [apps/*]`, which is what puts the root `node_modules/.bin` on PATH
  for `pnpm run` inside `apps/hanzo-desktop` (without it the scripts died with
  `tsc: not found`). Do not delete the file to "restore" non-workspace status;
  deleting it silently drops every override (real react-native replaces the
  web-lite alias) and unhoists katex out from under the vite build. Keep the
  `react-native` override's major in step with the direct
  `@hanzogui/react-native-web-lite` dependency, or you ship two copies.
- The main window renders `@hanzo/app`'s App (above) and is the only window:
  Spotlight, the Node Manager, the Coordinator and the Artifacts window are
  deleted, with everything only they reached (traced from `src/main.tsx` and every
  test with esbuild and `tsc --listFilesOnly`, not by name). The wdio specs under
  `e2e/` other than `login.e2e.ts` drive routes that no longer exist.
- `@hanzo/ai` is now only a package.json dependency, not an import of
  `src/main.tsx`. Keep it declared regardless (it was once undeclared and an
  install pruned it).
- The workspace libs are `@hanzo/desktop-brand-config` and `@hanzo/desktop-logo`.
  The `desktop-` segment is **required**, not cosmetic: `@hanzo/logo` is a separate
  published package, so a bare name collides with a real dependency. Nothing resolves through node_modules (there is no `@hanzo/desktop-*` there):
  the specifiers exist only as `tsconfig.base.json` paths, which vite reads via
  `tsconfigPaths()`. To rename one, change the paths key and the lib's
  package.json `name` — those two carry the whole graph.
- `NOTICE` and the `LICENSE` copyright line credit Shinkai / Mariana Layer Labs.
  They are the Apache-2.0 §4(d) attribution for the code this repo forked and
  must **stay**. They are the one intentional exception to "no upstream
  references"; every other Shinkai mention has been removed, so a grep hit
  outside those two files is real residue.
- **grep cannot read pixels, and that is how seven videos survived that purge.**
  Every `.mp4` in the tree was Shinkai-branded in its FRAMES while its filename
  was Hanzo: `hanzo-tools.mp4` opened on a window titled "Shinkai Tools". The
  README's demo linked an 84-second GitHub attachment that says Shinkai in 71 of
  its 84 seconds, behind a genuinely-Hanzo poster image — invisible to a reader
  of the markdown, unmissable to anyone who clicked. Renaming a file is not
  rebranding its contents.

  Two leaked something else again: `download-model.mp4` and `octopus.mp4` carry a
  **runway** watermark on every frame, a third-party generator's mark shipping
  inside our bundle.

  All seven are deleted, with the `HANZO_TUTORIALS` R2 URLs (four more Shinkai
  recordings, streamed at runtime, importer commented out) and the dead
  `assets/videos` barrel — 39 MB of bundle that no code path reached. Re-record
  before re-adding; do not restore these.

  Audit media the way the text is audited — read the frames:

      ffmpeg -i <file> -vf fps=1 /tmp/f/%03d.png
      for p in /tmp/f/*.png; do tesseract "$p" - --psm 11; done | grep -ioE 'shinkai|runway'


## Video: grep cannot read pixels

Every video this repo shipped was branded for the project it was forked from.
The filenames said Hanzo, the frames said Shinkai, so a text audit over the tree
found nothing and one click on the README found all of it. OCR'ing every frame
of all seven (`ffmpeg -vf fps=1` into `tesseract`) put five on Shinkai and three
under a Runway watermark. All seven are deleted, along with the dead
`HANZO_TUTORIALS` R2 URLs and the `libs/hanzo-ui/src/assets/videos` barrel.

`NOTICE` is untouched and must stay: Apache-2.0 §4(d) requires the upstream
attribution, and a brand leak in a video is a different thing from a licence
obligation in a text file.

Audit a media file, never grep for it:

    ffmpeg -i <file> -vf fps=1 /tmp/f/%03d.png
    for p in /tmp/f/*.png; do tesseract "$p" - --psm 11; done | grep -ioE 'shinkai|runway'

### GitHub will not inline a video that lives in the repo

`assets/hero.mp4` is committed and the README links it from a poster, which is
not a stylistic choice: **GitHub strips a `<video>` tag whose `src` is a repo
blob.** Inline playback is allowed only for assets uploaded through GitHub's own
attachment flow (`github.com/user-attachments/assets/…`), and that flow is a
browser drag-and-drop with no API — which is exactly how the upstream-branded
clip got there in the first place.

Two traps in checking this:

- **The `/markdown` API disagrees with the repo page.** `gh api /markdown` keeps
  the `<video>` tag in every form, including with `poster`, `controls` and
  `playsinline`. The rendered repo page drops it. Testing the API tells you
  nothing.
- **`curl` on the page tells you nothing either.** The README HTML arrives
  inside a client-rendered payload, so grepping for `<video` finds nothing
  whether it rendered or not. Drive a browser and look — that is what finally
  settled it, and it is the same lesson as OCR-not-grep one section up.

The poster is frame 5 of the film itself (`ffmpeg -ss 5 -frames:v 1`), so the
still and the video are one artifact and cannot drift. It replaced a screenshot
showing a chat composer and four suggestion chips — the composer is real now,
the four chips are not, and the footage is recorded from the app either way.

### Re-recording: `pnpm film`

The replacement footage is recorded FROM THE APP, so it cannot show a brand this
build does not have.

    pnpm film            # both takes -> e2e-tests/.film/**/video.webm
    pnpm film:masters    # -> hero.mp4 1920x1080 + hero-portrait.mp4 1080x1920

Two takes because `@hanzo/frame`, the hero primitive on the web surfaces, picks
between two masters by ORIENTATION rather than width — a phone is 0.46 wide-to-
tall and a 16:9 master covering it shows the middle quarter. The projects in
`playwright.config.ts` record AT those two sizes, so the output drops straight
in with no re-crop. Masters are gitignored: a 20 MB binary in git is in git
forever, which is half of why the originals were so expensive to remove.

Three things worth knowing before editing the shot list:

- **It queries BY ROLE on purpose.** Driving the film the way an assistive
  client drives the app means an accessibility regression stops the recording
  instead of shipping. That is not theoretical — see the checkbox below, which
  this spec is what found.
- **It does not type a message, and that is the honest shot.** There is no
  composer in this build (below). The first cut reached for a textbox, found
  only the header Search, and filmed a chat prompt going into a search field.
  Add the conversation beat when the composer exists; do not fake it.
- **`masters.mjs` resolves ffmpeg by RUNNING it**, rather than taking the first
  on PATH. This machine had an x86-64 ffmpeg parked in `~/.local/bin` ahead of
  the working arm64 one; `execvp` gets ENOEXEC and hands the ELF to `/bin/sh`,
  which reports a SYNTAX ERROR — a message that names a shell and a paren and
  says nothing about architecture. An interactive shell hides it by caching the
  good path, so it reproduces only from a script.

## Branding leak in old branches

### The tip is not the leak — 53 branches and main's own history still serve them

Deleting the six files on main removed them from ONE commit. Measured after
that commit landed, on the public repo:

- **53 of 54 pushed branches still carry all six `.mp4`s in their trees**, and
  they are served, not merely stored:
  `raw.githubusercontent.com/hanzoai/desktop/ui-standard-8x/apps/hanzo-desktop/public/tutorials/add-ai.mp4`
  answers **200, 6,143,401 bytes**.
- **Main's own history serves them too** — the same path at `04d1bc4df`, the
  commit before the deletion, answers 200.

So the tip-only deletion closed the README and nothing else. The linked
`user-attachments` asset does 403 now, which is why this looks fixed from the
rendered page and is not.

Closing it needs two things, in order, and only the second one is irreversible:

1. Strip the six paths from the remaining branch tips (additive commits, no
   history rewrite, no branch deleted, no work lost).
2. `git filter-repo` the six paths out of all history and force-push. This
   rewrites public history, so every clone re-clones and open PRs need
   rebasing.

**Do not sweep `backup/*`, `rescue/*` or `preserve/*` to shortcut step 1.**
Twenty-two of the 54 branches are scratch by name, but those three families
were created by earlier sessions to hold rescued orphan work that has no other
copy — deleting them to close a branding leak trades a reputational problem for
a data-loss one.

#### …and the two-step close is NOT worth running here

The section above is right about the measurement and wrong about the remedy.
Three facts, established after it was written:

- **`NOTICE` already credits Shinkai / Mariana Layer Labs** under Apache-2.0
  §4(d). This is a correctly-attributed fork, so upstream-branded footage in it
  is not a disclosure — the defect was presenting that footage as OUR product
  demo ("Watch Hanzo agents collaborate…"), and deleting it on main fixed
  exactly that.
- **`forks=0`, `network=0`.** No fork holds the blobs.
- **A force-push would not make them unobtainable anyway.** git keeps
  unreferenced objects reachable by sha until a GC that cannot be triggered from
  outside; anyone who already cloned has them. Making these bytes genuinely
  unreachable means asking GitHub Support to purge, not rewriting history.

So the rewrite buys a partial close of a tidiness problem, and costs an
irreversible rewrite of a public repo that renumbers 54 branches and invalidates
every clone. Not worth it. Strip the paths opportunistically when a branch is
touched for another reason, and let the rest age out with the branches.

**The general rule, which does survive:** measure a leak with the transport
(`curl` on `raw.githubusercontent.com`, across branches AND a pre-deletion sha),
never with the working tree — and then decide the remedy from what is actually
exposed and to whom, not from the size of the number the measurement produced.

## Dependency floors live in pnpm-workspace.yaml, one per installed major

`pnpm-workspace.yaml` is where pnpm 11 reads `overrides` — its own header says
so, and the `pnpm` field in package.json is inert. A first pass that wrote 29
overrides there resolved to exactly nothing, and the only reason that was caught
is that the lockfile was re-read afterwards and compared against the floors. A
green `pnpm install` proves the resolver ran, never that it did what you asked.

Three rules the 116-alert sweep established:

- **One floor per MAJOR that is actually installed.** A blanket
  `minimatch: '>=10.2.3'` drags every package pinned at `^3` onto a different
  API. The advisories are already per-major (`< 1.1.16`, `>= 2.0.0 < 2.1.2`,
  `>= 3.0.0 < 5.0.7`) — mirror that, and skip majors the tree does not contain.
- **A `pkg@range` selector matches the DECLARED range, not the resolved
  version.** A dependent asking for `^5.0.0` slips straight past
  `'brace-expansion@5'`. Where only one vulnerable major is left, a bare
  selector is unambiguous and leaves the higher copies alone.
- **Check what a floor cost you.** `js-yaml` and `undici` satisfied theirs by
  crossing a major (4→5, 7→8). Acceptable here only because every dependent is
  dev-surface — eslint, cosmiconfig, mocha, webdriver, cheerio.

A floor that resolves to nothing is invisible, so verify against the LOCKFILE
and not against the install. The first sweep skipped four packages by probing
"is this major installed?" against the PRE-override lockfile — including a
critical — and only GitHub's own recount caught it. `serialize-javascript` and
`uuid` were two of those and both took their floor fine (mocha and
vite-plugin-top-level-await are the only dependents, build-and-test only).

Not fixable, and each for a stated reason: `dompurify` / `extract-zip`
/ `image-size` (no patched release exists), and `glib` 0.18.5 in
`src-tauri/Cargo.lock` (the whole gtk-rs 0.18 stack — atk, cairo-rs, gdk,
gdk-pixbuf, gdkx11, gio, gtk, javascriptcore-rs — pins it, so 0.20 needs an
upstream Tauri bump, not a `cargo update`).

**`libs/*` is not a workspace package and must not gain a lockfile.**
`pnpm-workspace.yaml` lists `apps/*` only; the libs compile from source through
the tsconfig `paths` mapping and take their dependencies from the root install.
`libs/hanzo-message-ts` had drifted into carrying its own npm `package-lock.json`
— a second package manager resolving a tree nothing built against — and it was
worth 32 alerts including a critical, 29 of them one stale axios while the root
had already moved to 1.18.1. Deleted. If a lib needs a dependency, add it at the
root.

## Desktop Architecture, Build & Keybindings (2026-11-19)
- **Tauri Workspace Isolation (`apps/hanzo-desktop/src-tauri/Cargo.toml`)**: Includes `[workspace]` at the manifest root so Cargo never walks up to parent workspace manifests (`~/work/hanzo/Cargo.toml`) during `tauri build` or `tauri dev`.
- **Dock Reopen (`apps/hanzo-desktop/src-tauri/src/main.rs`)**: `RunEvent::Reopen` delegates to `recreate_window(app_handle.clone(), Window::Main, true)` so reopening from the macOS Dock after closing (`⌘W`) mounts `index.html` (`main_url("/chat")`) with microphone permissions enabled rather than raw `localhost:3000`.
- **Desktop Settings & Shortcuts (`apps/hanzo-desktop/src/desktop-shortcuts.tsx`, `host.tsx`, `patches/@hanzo__app@0.3.149.patch`)**:
  - `⌘K` / `Ctrl+K`: Toggle Search / Command Palette (`Palette.js`).
  - `⌘N` / `Ctrl+N` (Desktop) & `⇧⌘O` / `Ctrl+Shift+O` (Web + Desktop): New Chat (`empty(); move(talk())`).
  - `⌘B` / `Ctrl+B`: Toggle left sidebar (`closed` / mobile `drawer`).
  - `⇧⌘M` / `Ctrl+Shift+M`: Toggle voice microphone input. There is no Fn voice key: Windows and Linux keyboards resolve Fn in firmware, so no key event ever reaches the app (`desktop-shortcuts.tsx`).
  - `⌘,` / `Ctrl+,`: Opens `DesktopSettings` (`/settings`). A bare `/settings` (the app's Profile, Personalization and Account) opens Account, which says those pages are on hanzo.ai and opens them there; `/settings/<section>` opens that section. The app's `/settings/organization…`, `/billing`, `/usage` and `/keys` have no page in this window: `host.tsx` (`onTheWeb`) opens them on hanzo.ai in the browser and the window stays put. `Esc` / `⌘[` returns to `/chat`.
  - `⌘/` / `Ctrl+/`: Opens Keyboard Shortcuts dialog in both signed-in and Guest / Local AI modes (`Me.js`).
  - `⌘.` / `Ctrl+.` & `⌘⇧B`: Toggle right side Tabs panel (`@hanzo/build`).
  - `⇧⌘I` / `Ctrl+Shift+I`: System-wide global New Chat (`create-chat` Tauri event wired in `host.tsx`).
  - `⇧⌘J` / `Ctrl+Shift+J`: not registered. Spotlight sent through the retired hanzo-node and is deleted; a quick-ask window would have to be built on the main window's chat path (`@hanzo/app` under `IamProvider` with the keychain session).
  - Unit tests: `./node_modules/.bin/vitest run --pool=threads --root apps/hanzo-desktop src/__tests__/keybindings.test.tsx`.

## Canonical `@hanzo/app` Shell (2026-11-19)
- **Single Canonical Shell (`apps/hanzo-desktop/src/host.tsx`, `src/app.css`, `index.html`)**: Desktop mounts directly on `@hanzo/app`'s canonical `<Rooms><App bar={BAR} /></Rooms>` shell (no duplicate `UnifiedDesktopShell` wrapper). `app.css` and `index.html` apply the obsidian `#050505` outer floor, `#09090b` collapsible left sidebar, and inset rounded `#0f0f12` stage pane (`1px solid rgba(255,255,255,0.08)` hairline border) directly onto `@hanzo/app`'s slots.
- **Multi-Brand Shell Identity (`apps/hanzo-desktop/src/lib/brand-identity.ts`)**: `resolveDesktopShellBrand({ viteBrand, hostname, pathname })` resolves `'hanzo' | 'dev' | 'bot' | 'team'` across `VITE_BRAND`, hostnames (`hanzo.bot`, `hanzo.team`), and internal paths (`/bots`, `/team`, `/channels`, `/dev`), plus `DESKTOP_CROSS_APPS` for cross-surface switching (`Chat`, `Dev`, `Bot`, `Team`, `Console`, `Desktop / Mobile`).

## Local AI: models on this computer, on Hanzo's engine

`src/local-ai.tsx` is the screen, opened from Settings > Local models (Manage local models) and by a
signed-out answer that needs a model (the app's "Select / Download Local Model", and `needsModel`);
the bar has no button for it. Signed out, every Settings door of the app (the rail's mark, ⌘,, the
palette, a row's menu) raises `hanzo:anon-settings` for its own small pane, which has no Local models;
`host.tsx` answers it with the window's Settings on Local models instead, so a guest can always reach,
and remove, what they downloaded. `src/lib/local-models.ts` is its one
seam; `src-tauri/src/local_models.rs` is the work, six commands, each `allow-` granted in
`capabilities/main.json` to the window's own pages only, so a hanzo.ai page cannot pull models or
fill the disk (`capabilities_test.rs` resolves the built ACL). The commands also refuse a repository not in `src/lib/local-sources.json`, the one list
the window's `LOCAL_SOURCES` and the Rust side (`include_str!`) both read, and a download that would
leave less than 2 GB free (`MIN_FREE_BYTES`):

- `local_models_pull(repo)` downloads into the engine's own Hugging Face cache (`HF_HUB_CACHE`, else
  `HF_HOME/hub`, else `~/.cache/huggingface/hub`), the layout `hanzo-engine serve -m org/name` loads and
  `hanzo engine list` reads (checked: it lists a model written here). Progress is the
  `local-models-progress` event, `{repo, done, total}` in bytes. `local_models_cancel` calls it off.
- A download that does not finish takes back what it wrote. Every exit path (tray Quit,
  `RunEvent::Exit`, and the update's install, which on Windows ends the process without that hook)
  cancels it and waits up to 2 s for that. What a crash or power cut still leaves is removed at the
  next start (`at_start`, also before the first status): the folder of an OFFERED model with no
  `refs/main`, which every download here writes last. A complete model and any model the app does
  not offer are never touched; the cache is shared with other tools.
- It does not shell out to `hanzo engine pull`: that CLI is not in the app, and it fetches the WHOLE
  repository, 6.6 GB for `zenlm/zen-nano-0.6b` (eight GGUFs and an MLX copy) where the engine needs
  1.2 GB. `wanted()` keeps top-level files and drops duplicate weight formats.
- `local_models_serve(repo)` runs `hanzo-engine serve -m <repo> -p 36900 --host 127.0.0.1` with
  `HF_HUB_OFFLINE=1`, only when the person presses Use (or chats with a downloaded model chosen). One
  at a time; `local_models_stop`, Remove, and app exit (`local_models::stop_all`) stop it.
- A crash, Force Quit or kill runs no exit code, so nothing can stop the engine then. While it
  serves, `<app data>/local-engine.json` records its process id, executable and start time (read
  back through `sysinfo`), and a stop clears it. At the next start (`at_start`, in `setup`, before a
  window can press Use) a recorded process still alive with that same executable and start time is
  ended; anything else under that id (another program, or none) is left alone, and the record goes.
  Never by name. Until that start, the old engine keeps :36900 and Use says the port is taken.
- What is offered is `src/lib/local-sources.json` (tag, repo, title, measured download size, and
  whether its model card says it `reasons` and calls `tools`, which is all the picker claims), and
  nothing else: the screen lists those models and the signed-out composer's picker offers those plus
  the router aliases (`enso`, `enso-free`, `enso-auto`). The 182-entry Ollama catalogue that listed
  models nobody could download is deleted.
- Test: `cargo test --bin hanzo-desktop local_models` (a stand-in model library on a local port),
  `src/__tests__/local-ai.test.tsx` (mocked `invoke`).
