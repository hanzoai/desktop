/**
 * Brand sign-in smoke — the white-label property, proven through the real UI.
 *
 * Runs against a live dev server started with the brand under test:
 *
 *   VITE_BRAND=zoo pnpm exec vite --port 1420
 *   VITE_BRAND=zoo pnpm test:smoke -- brand-sign-in
 *
 * It mocks only the Tauri IPC bridge (the same
 * `window.__TAURI_INTERNALS__.invoke` convention as machine-flow.spec.ts) so the
 * browser can stand in for the native shell. Everything above the bridge is the
 * real app: the real brand table, the real mark, the real PKCE code, the real
 * URL the app hands to the OS browser. Nothing about the session is faked —
 * the run stops at the authorize URL, because completing the exchange needs a
 * real credential at a real IdP.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:1420';

type Brand = 'hanzo' | 'lux' | 'zoo';
const BRAND = (process.env.VITE_BRAND ?? 'hanzo') as Brand;

// The canonical brand → IdP mapping, re-typed (not imported) so that editing the
// table without updating the contract fails here.
const EXPECTED = {
  hanzo: { name: 'Hanzo', origin: 'https://hanzo.id', clientId: 'hanzo-app', redirectUri: 'hanzo://oauth/hanzo' },
  lux: { name: 'Lux', origin: 'https://lux.id', clientId: 'lux-app', redirectUri: 'lux://oauth/lux' },
  zoo: { name: 'Zoo', origin: 'https://zoolabs.id', clientId: 'zoo-app', redirectUri: 'zoo://oauth/zoo' },
} as const;

const FOREIGN_HOSTS: Record<Brand, string[]> = {
  hanzo: ['lux.id', 'zoolabs.id'],
  lux: ['hanzo.id', 'zoolabs.id'],
  zoo: ['hanzo.id', 'lux.id'],
};

/**
 * Stand in for the native shell: record every IPC call, answer the handful the
 * sign-in path makes. `plugin:shell|open` is the one that matters — its `path`
 * is the URL the app would hand to the user's browser.
 */
async function installTauriBridge(page: Page) {
  await page.addInitScript(() => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    (window as unknown as { __ipc: typeof calls }).__ipc = calls;

    let nextCallbackId = 1;
    const invoke = async (cmd: string, args: Record<string, unknown> = {}) => {
      calls.push({ cmd, args });
      switch (cmd) {
        case 'plugin:shell|open':
          return null;
        case 'plugin:event|listen':
          return nextCallbackId++;
        case 'plugin:event|unlisten':
          return null;
        case 'secure_storage_set':
        case 'secure_storage_delete':
          return null;
        case 'secure_storage_get':
          // What the real command returns for an absent entry.
          throw new Error('Key not found');
        default:
          return null;
      }
    };

    (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: typeof invoke;
          transformCallback: (cb: unknown, once?: boolean) => number;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: () => nextCallbackId++,
    };
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser error]', msg.text());
  });
}

async function openedUrl(page: Page): Promise<string> {
  const calls = await page.evaluate(
    () => (window as unknown as { __ipc: Array<{ cmd: string; args: { path?: string } }> }).__ipc,
  );
  const open = calls.find((c) => c.cmd === 'plugin:shell|open');
  expect(open, 'the app never asked the shell to open an authorize URL').toBeTruthy();
  return open?.args.path ?? '';
}

test.describe(`${BRAND} desktop sign-in`, () => {
  const brand = EXPECTED[BRAND];

  test.beforeEach(async ({ page }) => {
    await installTauriBridge(page);
    await page.goto(BASE);
    await expect(page.getByText(/^Welcome to /)).toBeVisible({ timeout: 30_000 });
  });

  test('renders this brand and only this brand', async ({ page }) => {
    // The mark is the brand's own glyph, not a wordmark over the Hanzo H.
    await expect(page.locator(`svg[data-brand="${BRAND}"]`).first()).toBeVisible();
    await expect(page.locator('svg[data-brand]').first()).toHaveAttribute('aria-label', brand.name);

    for (const other of (['hanzo', 'lux', 'zoo'] as Brand[]).filter((b) => b !== BRAND)) {
      await expect(page.locator(`svg[data-brand="${other}"]`)).toHaveCount(0);
      await expect(page.getByText(EXPECTED[other].name, { exact: false })).toHaveCount(0);
    }

    await page.screenshot({ path: `e2e-tests/.artifacts/sign-in-${BRAND}.png`, fullPage: true });
  });

  test('offers a Sign in control gated on the terms', async ({ page }) => {
    const signIn = page.getByRole('button', { name: `Sign in with ${brand.name}` });
    await expect(signIn).toBeVisible();
    await expect(signIn).toBeDisabled();

    await page.getByText('I agree to the Terms of Service and Privacy Policy').click();
    await expect(signIn).toBeEnabled();
  });

  test('sends the user to its OWN IdP with a real PKCE request', async ({ page }) => {
    await page.getByText('I agree to the Terms of Service and Privacy Policy').click();
    await page.getByRole('button', { name: `Sign in with ${brand.name}` }).click();

    await expect
      .poll(async () => (await openedUrl(page)).length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const url = new URL(await openedUrl(page));
    console.log(`\n[${BRAND}] authorize URL: ${url.toString()}\n`);

    expect(url.origin).toBe(brand.origin);
    expect(url.pathname).toBe('/v1/iam/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(brand.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(brand.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has('client_secret')).toBe(false);

    for (const host of FOREIGN_HOSTS[BRAND]) {
      expect(url.toString()).not.toContain(host);
    }

    // And it listened for ITS OWN callback event, not another brand's.
    const listens = await page.evaluate(
      () =>
        (window as unknown as { __ipc: Array<{ cmd: string; args: { event?: string } }> }).__ipc
          .filter((c) => c.cmd === 'plugin:event|listen')
          .map((c) => c.args.event),
    );
    expect(listens).toContain(`${BRAND}-iam-callback`);
  });
});
