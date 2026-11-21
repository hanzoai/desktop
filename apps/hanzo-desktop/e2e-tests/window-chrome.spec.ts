/**
 * The main window's bar, measured: the sidebar's toggle, Back and Forward at the top-left, nothing else
 * (Local AI is reached from Settings), the bar dragging the window. Runs against the Vite frontend with no Tauri runtime, so the visitor
 * is the signed-out one "Not now" admits.
 */
import { expect, type Page, test } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR ?? 'test-results';

async function enter(page: Page, width = 1280, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue without signing in' }).click();
  await expect(page.locator('[data-slot="title-bar"]')).toBeVisible({ timeout: 30_000 });
}

test('the bar holds the sidebar toggle, Back and Forward at the top-left, and drags the window', async ({ page }) => {
  await enter(page);
  const bar = page.locator('[data-slot="title-bar"]');
  await expect(bar).toHaveAttribute('data-tauri-drag-region', 'true');
  const names = await bar.locator('[aria-label]').evaluateAll((all) =>
    all.filter((n) => (n as HTMLElement).offsetParent !== null).map((n) => n.getAttribute('aria-label')),
  );
  expect(names).toEqual(['Close sidebar', 'Back', 'Forward']);
  const toggle = await bar.getByRole('button', { name: 'Close sidebar' }).boundingBox();
  const forward = await bar.getByRole('button', { name: 'Forward' }).boundingBox();
  expect(toggle!.y, 'at the top').toBeLessThan(16);
  expect(forward!.x + forward!.width, 'all three at the left').toBeLessThan(260);
  // The rail starts with Chat: the toggle is the bar's, not the rail's too.
  const rail = page.getByRole('navigation', { name: 'Products' });
  for (const name of ['Chat', 'Dev', 'Library']) await expect(rail.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /sidebar/ })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/desktop-1280.png` });
});

test('the toggle shuts the sidebar and opens it', async ({ page }) => {
  await enter(page);
  const column = page.locator('[data-slot="app-column"]');
  await expect(column).toBeVisible();
  await page.locator('[data-slot="title-bar"]').getByRole('button', { name: 'Close sidebar' }).click();
  await expect(column).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/desktop-1280-shut.png` });
  await page.locator('[data-slot="title-bar"]').getByRole('button', { name: 'Open sidebar' }).click();
  await expect(column).toBeVisible();
});

test('Back and Forward walk the window’s history, by press and by ⌘[ ⌘]', async ({ page }) => {
  await enter(page);
  const rail = page.getByRole('navigation', { name: 'Products' });
  const path = () => new URL(page.url()).pathname;
  await rail.getByRole('button', { name: 'Dev', exact: true }).click();
  await expect.poll(path).toBe('/dev');
  await expect(rail.getByRole('button', { name: 'Dev', exact: true })).toHaveAttribute('aria-current', 'page');
  const bar = page.locator('[data-slot="title-bar"]');
  await bar.getByRole('button', { name: 'Back' }).click();
  await expect.poll(path).not.toBe('/dev');
  await expect(rail.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute('aria-current', 'page');
  await bar.getByRole('button', { name: 'Forward' }).click();
  await expect.poll(path).toBe('/dev');
  await page.locator('body').click({ position: { x: 640, y: 10 } });
  await page.keyboard.press('Meta+BracketLeft');
  await expect.poll(path).not.toBe('/dev');
  await page.keyboard.press('Meta+BracketRight');
  await expect.poll(path).toBe('/dev');
});

test('a narrow window opens the sidebar as a drawer from the bar, and nothing scrolls sideways', async ({ page }) => {
  await enter(page, 390, 844);
  await expect(page.locator('[data-slot="app-column"]')).toBeHidden();
  await page.locator('[data-slot="title-bar"]').getByRole('button', { name: 'Open sidebar' }).click();
  await expect(page.locator('[data-slot="drawer"]')).toBeVisible();
  await expect(page.locator('[data-slot="drawer"]').getByRole('navigation', { name: 'Products' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/desktop-390-drawer.png` });
});

test('hides Google Workspace setup, aligns the toggle with the traffic lights, and reaches Local AI from Settings', async ({ page }) => {
  await enter(page);
  // Google Workspace setup card must not be shown
  await expect(page.locator('[data-slot="setup-workspace"]')).toHaveCount(0);
  await expect(page.getByText('Google Workspace')).toHaveCount(0);

  // The top-left toggle sits on the macOS traffic lights' centre line (y=16.5px).
  const toggleBox = await page.locator('[data-slot="title-bar"]').getByRole('button', { name: 'Close sidebar' }).boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(Math.abs(toggleBox!.y + toggleBox!.height / 2 - 16.5)).toBeLessThanOrEqual(2.5);

  // The bar has no Local AI button.
  await expect(page.locator('[data-slot="header-local-ai"]')).toHaveCount(0);
});

test('a guest reaches Local AI by clicking: the sidebar’s Settings opens the window’s Settings on Local models', async ({ page }) => {
  await enter(page);
  // The gear beside Log in at the foot of the sidebar (the folded rail's copy is hidden at this width).
  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('desktop-local-models')).toBeVisible();
  await expect(page.locator('[data-slot="anon-settings-pane"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage local models' }).click();
  await expect(page.getByTestId('local-ai-manager-modal')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-1280-local-ai-guest.png` });
});

/** A signed-in window: the stand-in IPC hands back the shared sign-in (identity_adopt), the platform answers empty. */
async function signedIn(page: Page) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  const token = [b64({ alg: 'none', typ: 'JWT' }), b64({ sub: 'u1', name: 'James', email: 'james@acme.test', owner: 'acme', exp, orgs: [{ org: 'acme', role: 'member' }], org: 'acme' }), 'x'].join('.');
  await page.addInitScript((access_token) => {
    let callback = 1;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
      transformCallback: () => callback++,
      unregisterCallback() {},
      convertFileSrc: (p: string) => p,
      async invoke(cmd: string) {
        if (cmd === 'identity_adopt') return { access_token };
        if (cmd === 'plugin:event|listen') return callback++;
        return null;
      },
    };
  }, token);
  await page.route('**/v1/**', (route) =>
    route.request().url().endsWith('/stream')
      ? route.fulfill({ contentType: 'text/event-stream', body: ': ok\n\n' })
      : route.fulfill({ contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/chat');
  await expect(page.locator('[data-slot="title-bar"]')).toBeVisible({ timeout: 30_000 });
}

test('signed in, the sidebar’s account reaches Local AI by clicking', async ({ page }) => {
  await signedIn(page);
  // The account at the foot of the sidebar opens the window’s Settings on Account.
  await page.getByRole('button', { name: 'Account' }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('desktop-account')).toBeVisible();
  await page.getByRole('navigation', { name: 'Settings' }).first().getByText('Local models').click();
  await page.getByRole('button', { name: 'Manage local models' }).click();
  await expect(page.getByTestId('local-ai-manager-modal')).toBeVisible();
});
