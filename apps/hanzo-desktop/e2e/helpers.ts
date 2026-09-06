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
 * signed-in user with onboarding finished — the same envelope the app writes
 * itself. This unlocks the post-onboarding surfaces WITHOUT mocking any IPC or
 * component behaviour. Cloud mode (`hanzo_token` present) is used so no local
 * node spawn is required.
 *
 * The auth record no longer lives in localStorage — it persists to the OS
 * keychain through the `secure_storage_*` commands (see
 * `src/lib/secure-storage.ts`), so this writes through that same real command
 * rather than `localStorage.setItem`. `settings` is not a secret and still uses
 * localStorage.
 */
export async function restoreSignedInSession(): Promise<void> {
  await browser.execute(async () => {
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
    await (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__.invoke('secure_storage_set', {
      key: 'auth',
      value: JSON.stringify(auth),
    });
    localStorage.setItem('settings', JSON.stringify(settings));
  });
  await browser.refresh();
  await waitForAppMounted();
}

export async function navigateTo(routePath: string): Promise<void> {
  await browser.execute((p: string) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, routePath);
  await waitForAppMounted();
}

export { browser, $, expect };
