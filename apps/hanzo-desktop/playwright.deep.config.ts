import { defineConfig } from '@playwright/test';

import { detectChromium, launchArgs } from './e2e-tests/deep/support/chromium';

// Deep E2E: self-serves the built dist/ and seeds past the onboarding +
// node-health gates (see e2e-tests/deep/support/app-fixture.ts). No native
// .app / Tauri runtime, no external webServer — runnable headless in CI.
export default defineConfig({
  testDir: './e2e-tests/deep',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'line',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: detectChromium(), args: launchArgs },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 832 } },
    },
  ],
});
