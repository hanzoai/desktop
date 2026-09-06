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
 * There is no Tauri runtime here (see playwright.config.ts), so the node-manager
 * window gets a stub bridge: enough for React to mount, nothing that pretends a
 * Rust command succeeded.
 */
import { expect, test, type Page } from '@playwright/test';

// `must be used within` is the shape a Radix part throws when its provider is
// gone — which is what an import left pointing at @radix-ui after its parent
// migrated to gui produces, at RENDER time, in a window that otherwise builds
// clean. Two of those shipped (a SelectPrimitive.Trigger inside a gui Select, a
// Radix DialogClose inside the gui Dialog), so the bundle is guarded for it.
const FATAL =
  /Minified React error|Objects are not valid as a React child|Element type is invalid|must be used within/;

const stubTauri = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const invoke = async () => null;
    w.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: () => 1,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      plugins: {},
    };
    w.__TAURI_IPC__ = invoke;
  });

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

test('Tabs switch panels and Tooltip opens where placement says', async ({
  page,
}) => {
  await stubTauri(page);
  await page.goto('/src/windows/hanzo-node-manager/index.html');
  await page.waitForLoadState('networkidle');

  // Tabs — @hanzo/ui's, on @hanzogui/tabs.
  const tabs = page.locator('[role="tab"]');
  await expect(tabs.first()).toBeVisible();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');

  // Tooltip — this trigger's content carried `side="bottom"` under Radix and
  // now carries `placement="bottom"` on the root. If the hoist had been missed
  // the prop would have been dropped in silence and this would read "top".
  await page.locator('[role="button"], button').first().hover({ force: true });
  const tip = page.locator('[data-slot="tooltip-content"]');
  await expect(tip.first()).toBeVisible();
  await expect(page.locator('[data-placement]').first()).toHaveAttribute(
    'data-placement',
    'bottom',
  );
});
