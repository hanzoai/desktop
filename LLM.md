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

## GRPO Status

Desktop does NOT implement GRPO or training-free learning. Current gaps:
- No experience/trajectory storage
- No agent versioning or A/B testing
- No learning pipeline or training jobs
- Feedback system is generic text only
- No ML metrics/observability

Foundation exists (agent CRUD, message history with tool metadata, Zustand state, React Query).
Estimated 6-8 weeks to add full GRPO: experience infra, versioning, algorithm, UI.
