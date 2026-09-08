// THE FILM, RECORDED FROM THE APP.
//
// Every video this repo shipped was branded for the project it was forked from:
// the frames said Shinkai while the filenames said Hanzo, so a grep over the
// tree found nothing and one click on the README found all of it. They are
// deleted. This is how the replacements get made, so nobody is tempted to
// re-download somebody else's recording again.
//
// The footage is the REAL frontend at localhost — whatever this commit actually
// renders. It cannot show a brand this app does not have, and it cannot show a
// feature this app does not ship.
//
// Two takes, because `@hanzo/frame` (the hero primitive on the web surfaces)
// picks between two masters by ORIENTATION rather than width: a phone is 0.46
// wide-to-tall and covering it with a 16:9 master shows the middle quarter. The
// sizes here ARE its two masters, so the output drops straight in.
//
//     pnpm film            # both takes -> e2e-tests/.film/*/*.webm
//     pnpm film:masters    # -> hero.mp4 (1920x1080) + hero-portrait.mp4 (1080x1920)
//
// Queried BY ROLE throughout, on purpose: driving the film the way an assistive
// client drives the app means an accessibility regression stops the recording
// instead of shipping. That is not theoretical — the first cut of this spec is
// what found the consent control was a pressable div with no checkbox role.
//
// Nothing here is staged. Every click is a control this build actually serves,
// which is why the shot list is short: `Shell.tsx` renders an EmptyState per
// section until the feature pages are ported, so there is no conversation to
// film yet. Add that beat when the composer exists. Do not fake it.
import { expect, test } from '@playwright/test';

/** Long enough to read, short enough to loop. Tune per shot, not globally. */
const BEAT = 1800;
/** The two shots a still gets cut from — they hold longer. */
const HOLD = 2600;

test('the film', async ({ page }) => {
  // A demo film is the FIRST-RUN experience, so it must not inherit one.
  // `panels.ts` is a persisted zustand store, so a previous take leaves the
  // controls panel open and every shot after it lands one state out of phase —
  // which is how this spec started failing on a click that had just worked.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });

  // 1. The promise. Brand mark, one line about what it is, and the claim that
  //    matters most — that none of it leaves the machine.
  await expect(page.getByText(/Welcome to Hanzo Desktop/i)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(HOLD);

  // 2. Consent, then in. `Continue without an account` is the honest opening
  //    for a local-first app: it is the path that needs no server at all.
  await page.getByRole('checkbox').first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Continue without an account/i }).click();
  await page.waitForTimeout(HOLD);

  // 3. The engine is ours, and this is the one shot that says so. The picker
  //    lives behind Controls; opening it names the Zen family in the product's
  //    own UI rather than in a caption somebody could have written.
  await page.getByRole('button', { name: 'Open controls' }).click();
  await page.waitForTimeout(BEAT);
  await page.getByRole('button', { name: /Zen Nano/i }).click();
  await expect(page.getByText('Zen Omni')).toBeVisible();
  await page.waitForTimeout(HOLD);

  // 4. Escape rather than picking one. The open list IS the shot; the options
  //    render in a portal the pointer does not reach, and a film should not
  //    depend on a click that a layout change can start intercepting.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // 5. Light and back. The theme is one control, and switching it on camera
  //    shows the whole surface repaint rather than asserting that it can.
  await page.getByRole('button', { name: /Switch to light theme/i }).click();
  await page.waitForTimeout(HOLD);
  await page.getByRole('button', { name: /Switch to dark theme/i }).click();
  await page.waitForTimeout(BEAT);

  // 6. Close the panel. The toggle RENAMES itself when open, so matching on
  //    'Open controls' finds nothing here — one regex covers both states.
  await page.getByRole('button', { name: /controls$/i }).click();
  await page.waitForTimeout(900);

  // 7. What the product is made of, one section at a time. Each has its own
  //    first-run copy, so the pane genuinely changes rather than re-rendering.
  for (const section of ['Agents', 'Tools', 'Files']) {
    await page.getByText(section, { exact: true }).first().click();
    await page.waitForTimeout(BEAT);
  }

  // 8. Full width — the chrome gets out of the way, which is the whole point
  //    of a workspace you run yourself.
  await page.getByRole('button', { name: 'Use full width' }).click();
  await page.waitForTimeout(BEAT);

  // 9. Home, and hold. The last beat is the one the poster is cut from.
  await page.getByText('Chat', { exact: true }).first().click();
  await page.waitForTimeout(HOLD);
});
