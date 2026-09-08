// Real Tauri E2E — the app actually launches and renders.
// This is the load-bearing proof the harness drives the NATIVE binary (not the
// Vite frontend): a real window, the React bundle mounted into #root inside the
// WebKit/WRY webview, and `window.__TAURI_INTERNALS__` present (IPC available).
import { browser, $, expect, ROOT, waitForAppMounted } from './helpers';

describe('app launch', () => {
  before(async () => {
    await waitForAppMounted();
  });

  it('opens a native window and mounts React into #root', async () => {
    await expect($(ROOT)).toBeExisting();
    const html = await (await $(ROOT)).getHTML({ includeSelectorTag: false });
    expect(html.trim().length).toBeGreaterThan(0);
  });

  it('exposes the Tauri IPC bridge (proves this is the real app, not the dev frontend)', async () => {
    const hasTauri = await browser.execute(
      () =>
        typeof (window as unknown as { __TAURI_INTERNALS__?: unknown })
          .__TAURI_INTERNALS__ !== 'undefined',
    );
    expect(hasTauri).toBe(true);
  });

  it('cold-starts on the onboarding screen', async () => {
    // A fresh profile lands on /terms-conditions with the welcome heading.
    const welcome = await $('h1*=Welcome to Hanzo');
    await welcome.waitForDisplayed({ timeout: 30000 });
    await expect(welcome).toBeDisplayed();
  });
});
