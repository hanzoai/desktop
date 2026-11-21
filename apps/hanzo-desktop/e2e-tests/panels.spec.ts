/**
 * The window's two panels: one surface, one gap, the chat's icons in the chat's header.
 *
 * The sidebar and the chat are cut by the same `pane()`, so they share a colour
 * in light and in dark; the gap under the window's bar, at the bottom and
 * between them is one `--pane-gap`; and the chat's own controls sit inside the
 * chat panel, not in the bar.
 */
import { expect, type Page, test } from '@playwright/test';

async function enter(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /Not now|Continue without login/ }).click();
  await expect(page.locator('[data-slot="pane"]').first()).toBeVisible({ timeout: 30_000 });
}

const box = (page: Page, slot: string) =>
  page.locator(`[data-slot="${slot}"]`).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, fill: getComputedStyle(el).backgroundColor };
  });

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1890, 1440, 768, 390]) {
    test(`at ${width} in ${scheme}: one gap all round and one surface`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await enter(page, width);
      const [bar, side, chat] = await Promise.all([box(page, 'title-bar'), box(page, 'app-column'), box(page, 'pane')]);
      const view = await page.evaluate(() => ({ height: innerHeight, width: innerWidth }));
      const above = chat.top - bar.bottom;
      const below = view.height - chat.bottom;
      expect(Math.abs(above - below), 'under the bar equals at the bottom').toBeLessThanOrEqual(1);
      // A phone shows one panel, full-bleed: the sidebar is a drawer, so only the gap under the bar and at the foot are the same.
      if (width < 768) return;
      expect(Math.abs(side.top - chat.top), 'the panels start together').toBeLessThanOrEqual(1);
      expect(Math.abs(side.bottom - chat.bottom), 'the panels end together').toBeLessThanOrEqual(1);
      expect(Math.abs(side.left - above), 'the sidebar stands that far from the window').toBeLessThanOrEqual(1);
      expect(Math.abs(chat.left - side.right - above), 'and the chat that far from the sidebar').toBeLessThanOrEqual(1);
      expect(Math.abs(view.width - chat.right - above), 'and from the window’s end').toBeLessThanOrEqual(1);
      expect(side.fill, 'one colour').toBe(chat.fill);
    });
  }
}

test('the chat’s controls are inside the chat panel, below the bar', async ({ page }) => {
  await enter(page, 1440);
  const [bar, chat, controls] = await Promise.all([box(page, 'title-bar'), box(page, 'pane'), box(page, 'conversation-controls')]);
  expect(controls.top).toBeGreaterThanOrEqual(chat.top);
  expect(controls.bottom).toBeLessThanOrEqual(chat.bottom);
  expect(controls.right).toBeLessThanOrEqual(chat.right);
  expect(controls.top).toBeGreaterThanOrEqual(bar.bottom);
});
