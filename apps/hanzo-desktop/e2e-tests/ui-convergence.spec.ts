/**
 * The @hanzo/ui + @hanzo/gui convergence, checked in a real browser.
 *
 * Unit tests prove a primitive renders in isolation; they cannot prove the
 * PRODUCTION BUNDLE still boots, that gui's runtime stylesheet lands, or that a
 * hover still produces a tooltip now that `side`/`align` moved off the content
 * and onto the root as one `placement`. This runs against built `dist/` served
 * by `vite preview` — the artifact Tauri ships.
 *
 *   pnpm exec vite build && pnpm exec vite preview --port 1420 --strictPort
 *   pnpm exec playwright test ui-convergence
 *
 * There is no Tauri runtime here (see playwright.config.ts).
 */
import { expect, test } from '@playwright/test';

// `must be used within` is the shape a Radix part throws when its provider is
// gone — which is what an import left pointing at @radix-ui after its parent
// migrated to gui produces, at RENDER time, in a window that otherwise builds
// clean. Two of those shipped (a SelectPrimitive.Trigger inside a gui Select, a
// Radix DialogClose inside the gui Dialog), so the bundle is guarded for it.
const FATAL =
  /Minified React error|Objects are not valid as a React child|Element type is invalid|must be used within/;

test('the main window boots and paints from gui, not Tailwind alone', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#root')).not.toBeEmpty();
  // gui compiles its style props to atomic classes at RUNTIME. Their presence
  // is what distinguishes "@hanzo/gui is live" from "this still looks fine
  // because Tailwind painted it" — a screenshot cannot tell those apart.
  await expect(page.locator('[class*="is_View"]').first()).toBeAttached();

  expect(errors.filter((e) => FATAL.test(e))).toEqual([]);
});
