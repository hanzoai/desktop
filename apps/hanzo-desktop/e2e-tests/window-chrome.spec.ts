/**
 * The main window's chrome — measured, not reviewed.
 *
 * The window is hanzo.ai's app (@hanzo/app App) with the bar a browser would
 * have given it (host.tsx `BAR`): the sidebar's toggle, Back and Forward at the
 * top-left, the bar dragging the window. The rail below it leads with Chat,
 * Dev, Library, Scheduled tasks, Customize, then More. Runs against the Vite
 * dev frontend (playwright.config.ts) with no Tauri runtime, so the visitor is
 * the signed-out one "Not now" admits.
 */
import { expect, type Page, test } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR ?? 'test-results';

async function enter(page: Page, width = 1280, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: 'Not now' }).click();
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
  const marks = await rail.locator('[aria-label]').evaluateAll((all) => all.map((n) => n.getAttribute('aria-label')));
  expect(marks.slice(0, 6)).toEqual(['Chat', 'Dev', 'Library', 'Scheduled tasks', 'Customize', 'More']);
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
