# e2e-tests — frontend smoke (NOT Tauri E2E)

These Playwright specs load the **Vite dev frontend** (`http://localhost:1420`)
in headless Chromium. There is **no Tauri runtime and no IPC** here — they smoke
test UI rendering only (`page.goto(...)`, not the native app).

Run: `pnpm test:smoke` (needs the dev server up: `pnpm dev`).

The **real end-to-end suite** — which launches the actual `hanzo-desktop`
binary and drives the native webview over WebDriver (tauri-driver +
WebdriverIO) — lives in [`../e2e`](../e2e). Run it with `pnpm test:e2e`.

| script | drives | dir |
|---|---|---|
| `pnpm test:smoke` | Vite frontend in Chromium (no IPC) | `e2e-tests/` |
| `pnpm test:e2e` | real native Tauri app (real IPC) | `e2e/` |
