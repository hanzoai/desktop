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
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
