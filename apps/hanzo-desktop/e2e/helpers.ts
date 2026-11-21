// Shared helpers for the real-Tauri (WebdriverIO) suite. No mocks: they only
// drive the real app, starting with its first paint.
import { browser, $, expect } from '@wdio/globals';

/** The app mounts React here (apps/hanzo-desktop/index.html). */
export const ROOT = '#root';

/** Wait until the native webview has booted and React has mounted content. */
export async function waitForAppMounted(): Promise<void> {
  const root = await $(ROOT);
  await root.waitForExist({ timeout: 60000 });
  // React has rendered *something* (not an empty shell) — proves the real
  // bundle ran inside the Tauri webview, not just a blank window.
  await browser.waitUntil(
    async () =>
      (await root.getHTML({ includeSelectorTag: false })).trim().length > 0,
    { timeout: 60000, timeoutMsg: 'React never rendered into #root' },
  );
}

export { browser, $, expect };
