// Shared, DRY helpers for the real-Tauri (WebdriverIO) suite. No mocks: these
// only drive the real app — wait for first paint, navigate the hash router, and
// (for the post-onboarding surfaces) restore a real persisted session exactly
// as the app itself would on a returning launch.
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

/**
 * Seed the *real* persisted zustand stores so the app boots as a returning,
 * signed-in user with onboarding finished — the same localStorage envelope the
 * app writes itself. This unlocks the ProtectedRoute surfaces (home, chat,
 * mining) WITHOUT mocking any IPC or component behaviour. Cloud mode
 * (`hanzo_token` present) is used so no local node spawn is required.
 *
 * Onboarding is just two required steps (terms-conditions, analytics); marking
 * both completed makes `isOnboardingComplete()` true.
 */
export async function restoreSignedInSession(): Promise<void> {
  await browser.execute(() => {
    const auth = {
      state: {
        auth: {
          profile: 'main',
          node_address: 'http://127.0.0.1:9850',
          hanzo_identity: '@@hanzo_e2e.sep-hanzo',
          encryption_pk: 'e2e',
          identity_pk: 'e2e',
          api_v2_key: 'e2e-api-key',
          hanzo_token: 'e2e-cloud-token',
          hanzo_refresh_token: 'e2e-refresh-token',
        },
      },
      version: 0,
    };
    const settings = {
      state: {
        onboarding: {
          steps: {
            'terms-conditions': { completed: true, choice: true },
            analytics: { completed: true, choice: true },
          },
        },
        defaultAgentId: '',
      },
      version: 0,
    };
    localStorage.setItem('auth', JSON.stringify(auth));
    localStorage.setItem('settings', JSON.stringify(settings));
  });
  await browser.refresh();
  await waitForAppMounted();
}

/**
 * Navigate the in-app router (react-router `BrowserRouter`) to a path using
 * client-side history — pushState + a `popstate` event, which react-router
 * listens to — so we stay inside the real SPA instead of triggering a full
 * document load the embedded protocol can't serve.
 */
export async function navigateTo(routePath: string): Promise<void> {
  await browser.execute((p: string) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, routePath);
  await waitForAppMounted();
}

export { browser, $, expect };
