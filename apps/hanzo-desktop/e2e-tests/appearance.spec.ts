/**
 * The window reads in both schemes — measured, not reviewed.
 *
 * The window's skin (src/app.css) is cut for the dark scheme; left unscoped it
 * also dressed a window whose reader's system is light: the sidebar stayed
 * black under dark ink, so every title in it but the lit one vanished and a
 * non-developer saw a column of nothing. Each label in the sidebar must read
 * (WCAG 4.5:1) on whatever it sits on, in light and in dark.
 */
import { expect, type Page, test } from '@playwright/test';

async function enter(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /Not now|Continue without login/ }).click();
  await expect(page.locator('[data-slot="app-column"]')).toBeVisible({ timeout: 30_000 });
}

type Reading = { label: string; ratio: number };

/** Every title in the sidebar, with its contrast against what is painted behind it. */
async function sidebar(page: Page): Promise<Reading[]> {
  return page.evaluate(() => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [r, g, b, a];
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3]!;
      return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)).concat(1);
    };
    const ground = (el: Element): number[] => {
      const chain: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3]! > 0) chain.push(c);
        if (c && c[3] === 1) break;
      }
      return chain.reduceRight((under, c) => over(c, under), [255, 255, 255, 1]);
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v! / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const out: { label: string; ratio: number }[] = [];
    const column = document.querySelector('[data-slot="app-column"]')!;
    for (const el of column.querySelectorAll('button, a')) {
      const label = (el.textContent ?? '').trim();
      if (!label || (el as HTMLElement).offsetParent === null) continue;
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const bg = ground(el);
      const text = over(fg, bg);
      const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
      out.push({ label, ratio: (hi! + 0.05) / (lo! + 0.05) });
    }
    return out;
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every title in the sidebar reads in the ${scheme} scheme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await enter(page);
    const read = await sidebar(page);
    const names = read.map((r) => r.label);
    expect(names, 'the rail names its apps').toEqual(expect.arrayContaining(['Chat', 'Dev', 'Library']));
    for (const r of read) expect(r.ratio, `${r.label} on the ${scheme} sidebar`).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? 'test-results'}/sidebar-${scheme}.png` });
  });
}
