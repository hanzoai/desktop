# Hanzo Desktop SDK (`hanzoai/desktop`)

Open-source SDK, reusable React + Tauri v2 host components, pure-Rust desktop utility crates, and starter examples for building AI desktop applications.

## Repository Layout

```text
libs/
  desktop-sdk/      # @hanzo/desktop-sdk: Tauri runtime helpers, PKCE loopback sign-in, local AI client, UI chrome
  brand-config/     # @hanzo/desktop-brand-config: Brand table, hostname/env resolver, public PKCE metadata
  hanzo-logo/       # @hanzo/desktop-logo: <BrandMark /> theme-adaptive SVG component and brand assets
crates/
  log-redact/       # hanzo-log-redact: Scrub PEM keys, mnemonics, and bearer/OAuth secrets from desktop logs
  engine-bin/       # hanzo-engine-bin: Discover local OpenAI-compatible inference engine binaries
  projects/         # hanzo-projects: Fast developer workspace folder discovery under ~/work, ~/code, ~/dev, etc.
  shortcut-action/  # hanzo-shortcut-action: Cross-platform Super/Control global shortcut action mapping
examples/
  minimal-chat-desktop/  # Complete Tauri v2 + React + Vite starter app built on @hanzo/desktop-sdk
```

## Commands

- `pnpm install` installs workspace dependencies.
- `pnpm typecheck` type-checks all SDK libraries and examples.
- `pnpm test` runs the Vitest suite across `libs/*` and `examples/*`.
- `pnpm build` builds the starter desktop frontend (`examples/minimal-chat-desktop`).
- `pnpm dev` launches the starter frontend dev server on `http://localhost:1420`.
- `cargo test --workspace` runs unit tests across all Rust crates under `crates/*`.

## Guidelines

- Keep this repository focused strictly on reusable open-source SDK libraries, UI host primitives, Rust utility crates, and clean starter examples under Apache-2.0.
- Never commit credentials, API keys, signing keys, or proprietary product bundles.
- Preserve `LICENSE` and `NOTICE` in all distributions.
- `AGENTS.md` is a symlink to `LLM.md`.
