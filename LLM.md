# LLM.md - Hanzo Desktop

## Project

Desktop AI agent app. React + Vite + Tauri (Rust backend).

## Structure

```
apps/hanzo-desktop/
  src/               # React frontend
  src-tauri/         # Rust Tauri backend
  public/            # Static assets
libs/
  hanzo-ui/          # Shared UI components
  hanzo-i18n/        # Internationalization
  hanzo-message-ts/  # Message/job API types
```

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

## Release Pipeline

### Workflows
- Production: `.github/workflows/release-prod.yml` on tags `[0-9]+.[0-9]+.[0-9]+`
- Development: `.github/workflows/release-dev.yml` on tags `dev-v[0-9]+.[0-9]+.[0-9]+`

### Required Secrets

**Apple (macOS signing):** APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID, KEYCHAIN_PASSWORD

**Tauri updates:** TAURI_PRIVATE_KEY, TAURI_KEY_PASSWORD

**Windows EV (Google Cloud KMS):** EV_CODE_SIGNING_CERTIFICATE

**Infrastructure:** R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, SLACK_BOT_TOKEN

**App:** VITE_POSTHOG_API_KEY, SECRET_DESKTOP_INSTALLATION_PROOF_KEY

### Build Artifacts
- Installers: .AppImage (Linux), .dmg (macOS), .exe (Windows)
- Update bundles: .tar.gz (macOS/Linux), .nsis.zip (Windows)
- Signature files: .sig for Tauri auto-updater
- Uploaded to: GitHub Releases + Cloudflare R2 (download.hanzo.ai)
- Rollout: rename `updates-next.json` to `updates.json`

### Troubleshooting
- APPLE_CERTIFICATE must be base64 without newlines
- Use `base64 --decode > file` not `base64 --decode -o file`
- Ensure package.json version matches git tag
- Update check failures are handled gracefully (no user-facing errors)

## Machines (Docker Desktop replacement)

Desktop UI for Linux VMs (vfkit) and the docker / k3s stack served by the
`hanzod` daemon in `hanzoai/node/machine/`. Hanzo Desktop is a drop-in
all-in-one Docker Desktop replacement: containers, Kubernetes, and Linux
machines from one app, one binary backend.

```
apps/hanzo-desktop/
  src-tauri/src/machine/    # Tauri commands -> unix socket client
    socket.rs               # ~/.hanzo/run/machined.sock resolver
    types.rs                # mirrors machine/proto.go (Machine, ExecFrame, ...)
  src/pages/machines/       # React UI (list, create dialog, exec stream)
```

- Tauri commands: `machine_health`, `machine_list`, `machine_create`,
  `machine_start`, `machine_stop`, `machine_delete`, `machine_exec` (streaming).
- Wire format is JSON over the daemon's UNIX socket - see
  `hanzoai/node/machine/proto.go` for the authoritative contract.
- Brand gating: the Machines / Containers / K8s pages are Hanzo-only by
  default. Other brands (zoo, liquidity) must set `VITE_ENABLE_MACHINES=true`
  (or the equivalent runtime flag in `libs/brand-config`) to reveal them.
  See `libs/brand-config/src/index.ts::isMachinesEnabled`.

### e2e

`e2e-tests/machine-flow.spec.ts` runs against `pnpm dev`, mocks
`window.__TAURI_INTERNALS__.invoke` for the `machine_*` commands, and asserts
the create dialog round-trip. CI must pass `VITE_BRAND=hanzo` so the
Machines route renders.

## GRPO Status

Trainer-free GRPO lives in `hanzo_training::grpo` (a Rust **library** + a runnable
`grpo_toy` example) — there is no GRPO server/daemon yet. The desktop exposes a
**developer-preview** entry (`model_tools_grpo_run`, surfaced in the Model Tools
tab) that runs `cargo run -p hanzo-training --example grpo_toy` from a local
checkout (`HANZO_ML_DIR`). This is plumbing/demo only.

Productizing GRPO in-app still needs: experience/trajectory storage, agent
versioning / A/B testing, a real training job pipeline (driving the `Policy`
trait on a packaged model), feedback→reward mapping, and ML metrics. Foundation
exists (agent CRUD, message history with tool metadata, Zustand, React Query).
