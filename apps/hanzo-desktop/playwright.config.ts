// FRONTEND SMOKE — NOT Tauri E2E.
// These specs load the Vite dev frontend (http://localhost:1420) in headless
// Chromium with NO Tauri runtime / IPC — UI rendering smoke only. The REAL
// end-to-end suite that drives the native binary over WebDriver lives in
// ../e2e (WebdriverIO + tauri-driver). Scripts: `pnpm test:smoke` (this),
// `pnpm test:e2e` (real Tauri).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    // Honour the override. This was a hardcoded literal, so every
    // `PLAYWRIGHT_BASE_URL=…` run silently recorded whatever else happened to
    // be on 1420 — which is how a demo film got cut from a different branch's
    // dev server and committed. A default is fine; ignoring the caller is not.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // The smoke suite. It never records — video on every spec would put a
      // webm beside every assertion and none of them are footage.
      testIgnore: /film\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The two masters `@hanzo/frame` picks between by orientation. Recording at
    // the delivery size means no upscale and no re-crop: the viewport IS the
    // frame. `deviceScaleFactor: 2` because the app is read on retina.
    {
      name: 'film-landscape',
      testMatch: /film\.spec\.ts/,
      // A film is ~26s of deliberate holds. The 30s default is a
      // TEST budget, not a shot-list budget, and it truncated the
      // longer take while the shorter one passed.
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        video: { mode: 'on', size: { width: 1920, height: 1080 } },
      },
    },
    {
      name: 'film-portrait',
      testMatch: /film\.spec\.ts/,
      // A film is ~26s of deliberate holds. The 30s default is a
      // TEST budget, not a shot-list budget, and it truncated the
      // longer take while the shorter one passed.
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1080, height: 1920 },
        deviceScaleFactor: 2,
        video: { mode: 'on', size: { width: 1080, height: 1920 } },
      },
    },
  ],
});
