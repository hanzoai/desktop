# Repository Guidelines

## Project Structure & Module Organization
- apps: Desktop app at `apps/hanzo-desktop` (React + Vite + Tauri). Source in `src/`, static in `public/`, Rust in `src-tauri/`.
- libs: Shared packages (e.g., `libs/hanzo-ui`, `libs/hanzo-i18n`, `libs/hanzo-message-ts`).
- assets, docs, ci-scripts, tools: Shared resources and automation.
- Tests: Co-located using `__tests__/` and `*.test|spec.(ts|tsx)`.

## Build, Test, and Development Commands
- Dev (desktop): `npx nx serve hanzo-desktop` (Tauri dev; uses `src-tauri/tauri.conf.local.json`).
- Build (desktop): `npx nx build hanzo-desktop` (Tauri build).
- Unit tests: `npx nx test hanzo-desktop` (Vitest; reports to `coverage/apps/hanzo-desktop`).
- Lint: `npx nx lint hanzo-desktop` (ESLint config at repo root and app-level).
- Type check: `npx nx run hanzo-desktop:typecheck`.
- Rust check (tauri): `npx nx run hanzo-desktop:cargo-check`.
- Alternative (inside app): `cd apps/hanzo-desktop && npm run dev|build|lint`.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (`.editorconfig`).
- Formatting: Prettier with Tailwind plugin; single quotes enforced. Run: `npx prettier --write .`.
- Linting: ESLint with import ordering, React Hooks rules, Vitest rules (no focused tests).
- Naming: files/dirs kebab-case (`vector-search/`), React components/types PascalCase, variables/functions camelCase.

## Testing Guidelines
- Framework: Vitest + @testing-library/react.
- Locations: co-locate next to source (e.g., `component/__tests__/x.test.tsx`).
- Conventions: use `*.test.ts(x)`; avoid `only`/focused tests (linted).
- Run locally: `npx nx test hanzo-desktop`.

## Commit & Pull Request Guidelines
- Commits: Prefer Conventional Commits (e.g., `feat:`, `fix:`, `chore:`, `docs:`). Example: `feat: reasoning streaming UI and markdown support`.
- PRs must include:
  - Clear description and linked issues (e.g., `Closes #123`).
  - Screenshots/GIFs for UI changes.
  - Scope-limited diff; updated docs/i18n when relevant.
  - Local verification: lint, unit tests, and `cargo-check` pass.

## Security & Configuration Tips
- Env: copy `apps/hanzo-desktop/.env.example` as needed; never commit secrets.
- Tooling: Node 20+, npm 10+; Rust toolchain for Tauri.
- Patches: `postinstall` runs `patch-package`; update `patches/` when adjusting third-party deps.

## CI/CD & Code Signing (Updated 2025-10-24)

### Release Workflows
- **Production**: `.github/workflows/release-prod.yml` - Triggered on version tags `[0-9]+.[0-9]+.[0-9]+`
- **Development**: `.github/workflows/release-dev.yml` - Triggered on dev-version tags `dev-v[0-9]+.[0-9]+.[0-9]+`
- **Triggers**: Push a git tag like `git tag 1.0.0 && git push origin 1.0.0`

### Required GitHub Secrets (COMPLETE CHECKLIST)

#### ✅ Apple Developer (macOS Signing) - See APPLE_SETUP.md
- `APPLE_CERTIFICATE` - Base64 Developer ID Application certificate (.p12)
- `APPLE_CERTIFICATE_PASSWORD` - Password for .p12 file
- `APPLE_SIGNING_IDENTITY` - Certificate identity name
- `APPLE_ID` - Apple Developer account email
- `APPLE_PASSWORD` - App-specific password (not regular password)
- `APPLE_TEAM_ID` - 10-character team ID from developer.apple.com
- `KEYCHAIN_PASSWORD` - Random password for temporary keychain

#### ✅ Tauri Update Signing
- `TAURI_PRIVATE_KEY` - Generated with `npx @tauri-apps/cli signer generate`
- `TAURI_KEY_PASSWORD` - Password for private key

#### ✅ Windows EV Code Signing (Google Cloud KMS)
- `EV_CODE_SIGNING_CERTIFICATE` - EV certificate content
- Workload identity already configured in workflow

#### ✅ Infrastructure
- `R2_ACCESS_KEY_ID` - Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key
- `SLACK_BOT_TOKEN` - Slack notifications

#### ✅ Application
- `VITE_POSTHOG_API_KEY` - PostHog analytics
- `SECRET_DESKTOP_INSTALLATION_PROOF_KEY` - Installation verification

### Code Signing Details

1. **Tauri Update Signing**:
   - Self-signed updates for auto-updater
   - Public key in `tauri.conf.json` (already configured)
   - Creates .sig files for update verification

2. **macOS Code Signing & Notarization**:
   - Signs .dmg with Developer ID Application certificate
   - Notarizes with Apple (requires app-specific password)
   - Users can install without Gatekeeper warnings

3. **Windows EV Code Signing**:
   - Uses Google Cloud KMS (no local certificate needed)
   - Signs .exe installer with EV certificate
   - Prevents SmartScreen warnings

### Build Artifacts
Each release produces:
- Main installer (.AppImage for Linux, .dmg for macOS, .exe for Windows)
- Update bundle (.tar.gz for macOS/Linux, .nsis.zip for Windows)
- Signature file (.sig) for Tauri auto-updater verification

All artifacts uploaded to:
- **GitHub Releases** - For public downloads
- **Cloudflare R2** - CDN at download.hanzo.ai
- **updates.json** - Auto-updater manifest (rename updates-next.json → updates.json to rollout)

### Update Error Handling (Fixed 2025-10-24)
- Update checks gracefully handle network failures
- App continues without error if update check/download fails
- Errors logged via Tauri debug logger
- No user-facing errors for update failures

### Troubleshooting Releases (Updated 2025-10-25)
**Certificate Import Failures:**
- Ensure APPLE_CERTIFICATE is base64 encoded without newlines
- Ensure APPLE_CERTIFICATE_PASSWORD has no trailing newlines
- Use output redirection `>` instead of `-o` flag for base64 decode (more portable)
- Test certificate import locally: `security import cert.p12 -P password -k test.keychain`

**Common Issues:**
- Version mismatch: Ensure package.json version matches git tag
- Tag timing: Create tags AFTER secrets are configured
- Base64 syntax: Use `base64 --decode > file` not `base64 --decode -o file`
