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

---

## GRPO (Group Relative Policy Optimization) Implementation Analysis

### Executive Summary

The Hanzo Desktop application is **NOT currently implementing GRPO** or training-free experience-based learning systems. The platform focuses on agent creation, orchestration, and management, but has no capability for collecting structured learning experiences or optimizing agent policies through feedback.

### Current Relevant Capabilities

#### 1. Agent Management (Strong Foundation)
- **Location:** `/apps/hanzo-desktop/src/components/agent/`
- Agent CRUD, configuration, export/import
- Tool composition and orchestration
- LLM provider integration
- Agent marketplace discovery

#### 2. Conversation/Job Management (Partial Support)
- **Location:** `/libs/hanzo-message-ts/src/api/jobs/`
- Message history with pagination
- Tool execution metadata tracking
- Reasoning content capture
- Message hierarchy (parent references)
- **MISSING:** Trajectory grouping, reward signals, decision probabilities

#### 3. Feedback Collection (Minimal)
- **Location:** `/apps/hanzo-desktop/src/components/feedback/`
- Generic user feedback modal (text + contact only)
- No structured experience capture
- No preference/reward data
- No trajectory storage

#### 4. State Management (UI-Focused)
- **Location:** `/apps/hanzo-desktop/src/store/`
- Settings, auth, onboarding
- No learning state persistence
- No experience buffer system

### Critical Gaps for GRPO Implementation

#### 1. No Experience Storage System
- Missing trajectory/experience database schema
- No rollout history tracking
- No preference signal storage
- No batch collection mechanism

#### 2. No Agent Versioning/Rollout
- Agents are static configurations
- No A/B testing framework
- No canary/staged rollout support
- No experiment tracking

#### 3. No Learning Pipeline
- Agents don't learn from interactions
- No training job API
- No model checkpoint management
- No GRPO algorithm implementation

#### 4. Limited Message Capture
- Chat messages stored but not as structured trajectories
- Tool execution metadata exists
- Missing: reward signals, action probabilities, outcome markers
- No trajectory context grouping

#### 5. No Metrics/Observability for Learning
- Only basic PostHog UI analytics
- No ML-specific metrics
- No reward tracking
- No convergence monitoring

### Data Available for Learning

**Currently Captured (in JobMessage):**
✓ Message content and hierarchy
✓ Tool function calls and responses
✓ Execution metadata (duration, timing)
✓ Reasoning/thinking content

**Missing for GRPO:**
✗ Explicit reward signals
✗ Agent decision probabilities
✗ Outcome signals (success/failure)
✗ Comparison trajectory pairs
✗ Learning data split markers

### Recommended Implementation Roadmap

#### Phase 1: Experience Infrastructure (2 weeks)
1. Extend JobMessage schema with reward, outcome, decision logs
2. Create experience storage mutations/queries in hanzo-node-state
3. Add experience feedback UI components
4. Implement trajectory grouping mechanism

#### Phase 2: Versioning & Rollout (2 weeks)
1. Add agent versioning system
2. Build rollout policy configuration
3. Create rollout metrics tracking
4. Implement experiment/treatment group assignment

#### Phase 3: Learning Pipeline (2 weeks)
1. Implement GRPO algorithm in new `/libs/hanzo-grpo-ts/`
2. Build training job API integration
3. Add model checkpoint management
4. Implement preference learning pipeline

#### Phase 4: Learning UI (2-3 weeks, concurrent)
1. Trajectory review and annotation interface
2. Training configuration and monitoring dashboard
3. Agent version comparison and rollout controls
4. Learning metrics visualization

### Required File Structure

```
hanzo-desktop/
├── libs/
│   ├── hanzo-grpo-ts/
│   │   └── src/
│   │       ├── algorithms/
│   │       ├── utils/
│   │       └── types.ts
│   └── hanzo-node-state/src/v2/
│       ├── mutations/
│       │   ├── submitExperience/
│       │   ├── recordTrajectory/
│       │   └── createTrainingJob/
│       └── queries/
│           ├── getTrajectories/
│           ├── getExperienceBuffer/
│           └── getTrainingJobs/
└── apps/hanzo-desktop/src/
    ├── components/
    │   ├── experience/ (trajectory rating, preference UI)
    │   ├── training/ (training control, monitoring)
    │   └── agent/ (versioning, rollout control)
    ├── pages/
    │   ├── agent-training.tsx
    │   ├── experience-management.tsx
    │   └── training-metrics.tsx
    └── hooks/
        ├── use-trajectory-collection.ts
        ├── use-training-job.ts
        └── use-agent-versions.ts
```

### Implementation Priorities

**MVP (Must Have):**
- Experience capture schema extension
- Trajectory storage and retrieval
- Preference comparison UI
- Training job API integration

**Should Have:**
- GRPO algorithm implementation
- Agent versioning system
- Rollout control dashboard
- Training progress monitoring

**Nice to Have:**
- Advanced analytics dashboard
- Automated rollout orchestration
- Multi-agent learning coordination
- GPU acceleration

### Current Architecture Strengths

✓ Strong TypeScript/Zod type safety
✓ Modern React hooks and patterns
✓ Robust React Query mutation/query system
✓ Clean component architecture
✓ Good state management (Zustand)
✓ Message history with parent tracking
✓ Tool execution metadata

### Current Limitations

✗ No distributed training infrastructure
✗ Feedback system too minimal
✗ No agent checkpointing
✗ Message format not optimized for learning
✗ No trajectory grouping
✗ Limited ML metrics/observability

### Estimated Timeline

- **Phase 1 (Infrastructure):** 2 weeks
- **Phase 2 (Versioning):** 2 weeks
- **Phase 3 (Learning Algorithm):** 2 weeks
- **Phase 4 (UI/Integration):** 2-3 weeks
- **Testing & Deployment:** 1-2 weeks

**Total: 6-8 weeks for production GRPO system**

### Key Insights

Hanzo Desktop is **well-positioned for GRPO integration** due to its solid foundation in:
- Agent management and orchestration
- Message/conversation tracking
- Tool execution metadata
- Clean architecture and type safety

The main work involves:
1. Extending message schemas for learning
2. Building experience collection infrastructure
3. Implementing GRPO algorithm
4. Creating training control UI
5. Adding agent versioning and rollout management

No fundamental architectural changes needed—primarily additive work on top of existing systems.
