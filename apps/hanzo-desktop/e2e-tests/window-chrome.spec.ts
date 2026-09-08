/**
 * Window chrome — measured, not reviewed.
 *
 * A green build proves a gui component COMPILED, never that it painted: gui
 * drops props it does not recognise without an error, so every claim here is a
 * computed style or a bounding box read out of a real Chromium. Runs against
 * the Vite dev frontend (see playwright.config.ts) with no Tauri runtime.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

const SHOT = '/private/tmp/claude-501/-Users-z/e9e420de-f00b-4dca-8909-cba11a127dd4/scratchpad/desktop';

/** The chrome's pointer-target floor. Every square in the cluster is this. */
const CHROME = 44;
/** WCAG 2.5.8 — no interactive control may be smaller than this. */
const MIN_TARGET = 24;

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('no bounding box');
  return rect;
};

/** The Welcome gate stands in front of the shell; this is the local path past it. */
async function enterShell(page: Page) {
  await page.goto('/');
  await page.getByText('I agree to the Terms of Service').click();
  await page.getByText('Continue without an account').click();
  await expect(page.getByTestId('chrome-row')).toBeVisible();
}

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  // Clear persisted panel state ONCE per context — an init script runs on every
  // navigation, so clearing unconditionally would wipe the very state the
  // reload test is there to check.
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('chrome-spec-cleared')) {
      window.localStorage.removeItem('panels');
      window.sessionStorage.setItem('chrome-spec-cleared', '1');
    }
  });
});

test('cluster controls are one 44px square each, with one focus ring', async ({
  page,
}) => {
  await enterShell(page);

  const ids = [
    'toggle-sidebar',
    'maximize-content',
    'companions-menu',
    'toggle-right-panel',
  ];

  for (const id of ids) {
    const rect = await box(page.getByTestId(id));
    expect.soft(`${id} ${rect.width}x${rect.height}`).toBe(`${id} ${CHROME}x${CHROME}`);
  }

  // ONE focus indicator across the cluster. Focus is moved with the KEYBOARD,
  // because :focus-visible is what the ring hangs off and a programmatic
  // .focus() does not always arm it.
  const rings = new Set<string>();
  for (const id of ids) {
    await page.getByTestId(id).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    rings.add(
      await page.getByTestId(id).evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineOffset} ${s.outlineColor}`;
      }),
    );
  }
  expect(rings.size, `distinct focus rings: ${[...rings].join(' | ')}`).toBe(1);
  expect([...rings][0]).not.toContain('none');

  await page.screenshot({ path: `${SHOT}/01-chrome-row.png` });
  expect(errors).toEqual([]);
});

test('every toggle names itself and states which way it goes', async ({ page }) => {
  await enterShell(page);

  for (const id of ['toggle-sidebar', 'maximize-content', 'toggle-right-panel']) {
    const control = page.getByTestId(id);
    await expect(control).toHaveAttribute('aria-label', /\S/);
    await expect(control).toHaveAttribute('aria-expanded', /^(true|false)$/);
  }
  const menu = page.getByTestId('companions-menu');
  await expect(menu).toHaveAttribute('aria-haspopup', 'menu');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('companions menu: 44px rows, right-aligned to its trigger, Escape closes', async ({
  page,
}) => {
  await enterShell(page);
  const trigger = page.getByTestId('companions-menu');
  await trigger.click();

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const rows = page.getByRole('menuitem');
  await expect(rows).toHaveCount(5);
  for (let i = 0; i < 5; i += 1) {
    const rect = await box(rows.nth(i));
    expect.soft(`row${i} h=${rect.height}`).toBe(`row${i} h=${CHROME}`);
  }

  // Right-aligned to the TRIGGER, not merely to the viewport.
  const menuBox = await box(menu);
  const triggerBox = await box(trigger);
  expect(Math.round(menuBox.x + menuBox.width)).toBe(
    Math.round(triggerBox.x + triggerBox.width),
  );

  // The shortcut sits at the row's right, and it has to be readable there.
  const shortcut = rows.first().getByText('⌘1');
  await expect(shortcut).toBeVisible();
  const contrast = await shortcut.evaluate((el) => {
    const luminance = (color: string) => {
      const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const channel = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    // Walk up for the first painted background — the row and panel are layered.
    let node: HTMLElement | null = el;
    let bg = 'rgb(0, 0, 0)';
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && !c.includes('rgba(0, 0, 0, 0)')) {
        bg = c;
        break;
      }
      node = node.parentElement;
    }
    const a = luminance(getComputedStyle(el).color);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast, `shortcut contrast ${contrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

  await page.screenshot({ path: `${SHOT}/02-companions-menu.png` });

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});

test('menu is reachable and operable from the keyboard alone', async ({ page }) => {
  await enterShell(page);
  await page.getByTestId('companions-menu').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();

  // Opening moves focus INTO the menu, onto its first row — the ARIA
  // menu-button pattern, and what makes the arrow keys have somewhere to go.
  await expect(page.getByRole('menuitem').first()).toBeFocused();

  // The shared roving handler owns arrow keys over [role=menuitem].
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem').last()).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page.getByRole('tab')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('dock: opens, adds and closes tabs, and closes as a whole', async ({ page }) => {
  await enterShell(page);

  await page.getByTestId('companions-menu').click();
  await page.getByTestId('companion-tools').click();
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);
  // The companions button reports the DOCK's state, not the menu's.
  await expect(page.getByTestId('companions-menu')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await page.getByTestId('dock-new-tab').click();
  await expect(page.getByRole('tab')).toHaveCount(2);

  await page.keyboard.press('ControlOrMeta+3');
  await expect(page.getByRole('tab')).toHaveCount(3);

  // A tab's × closes THAT tab and nothing larger.
  const firstTabId = await page.getByRole('tab').first().getAttribute('id');
  await page.getByTestId(`dock-tab-close-${firstTabId!.replace('dock-tab-', '')}`).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tablist')).toBeVisible();

  await page.screenshot({ path: `${SHOT}/03-dock-open.png` });

  // The strip's × closes the whole panel.
  await page.getByTestId('dock-close').click();
  await expect(page.getByRole('tablist')).toBeHidden();
  expect(errors).toEqual([]);
});

test('dock resizes from its top edge and honours a floor', async ({ page }) => {
  await enterShell(page);
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.getByRole('tablist')).toBeVisible();

  const dock = page.locator('[data-panel-id="dock"]');
  const before = (await box(dock)).height;

  const grab = page.getByTestId('dock-resize-grab');
  const seam = await box(grab);

  // The grab band is 8px and centred on the seam, so a press 3px ABOVE the
  // rule — which a 1px target could never catch — still starts a resize.
  const probes = await page.evaluate((y) => {
    const at = (dy: number) =>
      document.elementFromPoint(400, y + dy)?.getAttribute('data-testid') ??
      document.elementFromPoint(400, y + dy)?.getAttribute('data-panel-resize-handle-id') ??
      document.elementFromPoint(400, y + dy)?.tagName;
    return [-3, -1, 0, 1, 3].map(at);
  }, Math.round(seam.y + seam.height / 2));
  expect(probes.every((p) => p === 'dock-resize-grab')).toBe(true);

  await page.mouse.move(400, seam.y + 1);
  await page.mouse.down();
  await page.mouse.move(400, seam.y - 120, { steps: 12 });
  await page.mouse.up();
  const grown = (await box(dock)).height;
  expect(grown).toBeGreaterThan(before + 60);

  // Push past the floor: the dock must stop, not vanish.
  const seam2 = await box(page.getByTestId('dock-resize-grab'));
  await page.mouse.move(400, seam2.y + 1);
  await page.mouse.down();
  await page.mouse.move(400, seam2.y + 2000, { steps: 20 });
  await page.mouse.up();
  const floored = (await box(dock)).height;
  const column = (await box(page.locator('[data-panel-group][data-panel-group-direction="vertical"]'))).height;
  expect(floored).toBeGreaterThan(0);
  expect(Math.round((floored / column) * 100)).toBeGreaterThanOrEqual(14);

  await page.screenshot({ path: `${SHOT}/04-dock-resized.png` });
  expect(errors).toEqual([]);
});

/**
 * The strip's height is a BUDGET the body pays for, and three controls at three
 * different sizes sit inside it — each bled back into the strip's padding so
 * the strip stays 41 (32 of content, 4 of padding either side, the 1px rule).
 *
 * None of this is visible in a screenshot, which is why it is here. A `+` that
 * drifted to the cluster's 44 would look right, would still clear the 24px
 * floor the test below checks, and would quietly take 3px from the
 * conversation AND overhang the resize grab above it — stealing the seam.
 */
test('the dock strip spends exactly its budget, over ONE rule', async ({
  page,
}) => {
  await enterShell(page);
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.getByRole('tablist')).toBeVisible();

  const strip = await box(page.getByRole('tablist'));
  expect(`strip h=${strip.height}`).toBe('strip h=41');

  // The tab is the TALLEST thing in the strip and so the thing that would
  // spend the budget: left to size off its own line-height it came out at 35.
  expect((await box(page.getByRole('tab').first())).height).toBe(32);

  const bleed = (id: string) =>
    page
      .getByTestId(id)
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`;
      });

  // The strip's two buttons: 40 for the pointer, 8 given back so the box the
  // layout budgeted for stays 32.
  for (const id of ['dock-new-tab', 'dock-close']) {
    const rect = await box(page.getByTestId(id));
    expect.soft(`${id} ${rect.width}x${rect.height}`).toBe(`${id} 40x40`);
    expect.soft(await bleed(id)).toBe('-4px -4px -4px -4px');
  }

  // A tab's × sits at the 24px floor exactly — under the chrome's 44, over
  // WCAG 2.5.8's minimum — and bleeds its 4px of growth back into the tab.
  const close = page.locator('[data-testid^="dock-tab-close-"]').first();
  const closeBox = await box(close);
  expect(`close ${closeBox.width}x${closeBox.height}`).toBe('close 24x24');
  expect(
    await close.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`;
    }),
  ).toBe('-2px -2px -2px -2px');

  // ONE rule at the seam. The handle paints a single hairline; a second one
  // from a panel border landing on the same line reads as a 2px seam, and
  // neither a screenshot nor the 8px-grab probe above would call it out.
  const seam = await box(page.getByTestId('dock-resize-grab'));
  const hairlines = await page.evaluate((y) => {
    const near = (v: number) => Math.abs(v - y) <= 3;
    const found: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 100) return;
      const style = getComputedStyle(el);
      const painted = !style.backgroundColor.includes('rgba(0, 0, 0, 0)');
      if (rect.height <= 2 && painted && near(rect.top)) {
        found.push(`fill@${rect.top.toFixed(1)}`);
      }
      if (parseFloat(style.borderTopWidth) > 0 && near(rect.top)) {
        found.push(`border-top@${rect.top.toFixed(1)}`);
      }
      if (parseFloat(style.borderBottomWidth) > 0 && near(rect.bottom)) {
        found.push(`border-bottom@${rect.bottom.toFixed(1)}`);
      }
    });
    return found;
  }, seam.y + seam.height / 2);
  expect(
    hairlines,
    `at the seam: ${hairlines.join(', ') || 'none'}`,
  ).toHaveLength(1);
  // And the one is the HANDLE's own painted rule, not a panel border that
  // happens to land there — the handle owns the seam.
  expect(hairlines[0]).toMatch(/^fill@/);

  expect(errors).toEqual([]);
});

test('no control is under 24px, and nothing scrolls sideways', async ({ page }) => {
  await enterShell(page);
  await page.keyboard.press('ControlOrMeta+1');
  await page.getByTestId('toggle-right-panel').click();
  await expect(page.getByTestId('right-panel')).toBeVisible();

  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const undersized = await page.evaluate((floor) => {
      const bad: string[] = [];
      document
        .querySelectorAll('button, [role="tab"], [role="menuitem"]')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          if (r.width < floor || r.height < floor) {
            bad.push(
              `${el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.tagName}: ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        });
      return bad;
    }, MIN_TARGET);
    expect(undersized, `at ${width}px`).toEqual([]);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `at ${width}px`).toBe(overflow.clientWidth);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${SHOT}/05-all-panels.png` });
  expect(errors).toEqual([]);
});

test('panel state survives a reload', async ({ page }) => {
  await enterShell(page);
  await page.getByTestId('toggle-sidebar').click();
  await page.getByTestId('toggle-right-panel').click();
  await page.getByTestId('maximize-content').click();
  await page.keyboard.press('ControlOrMeta+2');
  await page.keyboard.press('ControlOrMeta+4');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('sidebar')).toBeHidden();

  await page.reload();
  await page.getByText('I agree to the Terms of Service').click();
  await page.getByText('Continue without an account').click();

  await expect(page.getByTestId('sidebar')).toBeHidden();
  await expect(page.getByTestId('right-panel')).toBeVisible();
  await expect(page.getByTestId('maximize-content')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('tab')).toHaveCount(2);
  expect(errors).toEqual([]);
});

/**
 * The reserve keys off the UA, so the UA is what the test sets — sniffing the
 * runner would make this pass or skip depending on which machine ran it, and
 * the branch that matters is the one the Tauri macOS webview takes.
 */
test.describe('macOS overlay titlebar', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });

  test('the traffic-light corner is kept clear', async ({ page }) => {
    await enterShell(page);

    // Sidebar open: the brand mark sits below the lights.
    const mark = await box(page.getByTestId('sidebar').locator('svg').first());
    expect(mark.y).toBeGreaterThanOrEqual(28);

    // Sidebar shut: the chrome row is what reaches the corner, so the leftmost
    // control has to start to the RIGHT of them.
    await page.getByTestId('toggle-sidebar').click();
    await expect(page.getByTestId('sidebar')).toBeHidden();
    const toggle = await box(page.getByTestId('toggle-sidebar'));
    expect(toggle.x).toBeGreaterThanOrEqual(78);

    await page.screenshot({ path: `${SHOT}/06-sidebar-collapsed.png` });
    expect(errors).toEqual([]);
  });
});
