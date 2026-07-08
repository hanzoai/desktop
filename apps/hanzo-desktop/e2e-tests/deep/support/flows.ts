// Brand-agnostic deep E2E flows for the @hanzo/ai desktop SDK. Each register*()
// takes the per-app test object (makeApp result); the brand metadata (name,
// engine label, foreign brands) rides on the `app` fixture, so these flows are
// byte-identical across zoo / lux / hanzo — only support/app.ts differs.
//
// Assertions are on VISIBLE text / element state (never HTTP status). Flaky,
// async-mounted UI is wrapped in expect() auto-retry / waitFor.
import type { AppTest } from './app-fixture';

// ---------------------------------------------------------------------------
// onboarding: gate without seed, Home with seed
// ---------------------------------------------------------------------------
export function registerOnboarding({ test, expect }: AppTest) {
  test.describe('onboarding', () => {
    test('no seed -> welcome gate with terms checkbox', async ({ page, app }) => {
      await app.gotoFresh('/');
      await expect(page.getByText(`Welcome to ${app.brand}`, { exact: false })).toBeVisible();
      await expect(
        page.getByText('I agree to the Terms of Service', { exact: false }),
      ).toBeVisible();

      const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
      await expect(checkbox).toBeVisible();
      // Drive the gate: toggle the terms checkbox and assert it registers.
      await checkbox.click();
      await expect
        .poll(async () =>
          (await checkbox.getAttribute('aria-checked')) === 'true' ||
          (await checkbox.isChecked().catch(() => false)),
        )
        .toBeTruthy();

      // The composer/Home must NOT be present on the gate.
      await expect(page.getByText('How can I help you today?')).toHaveCount(0);
    });

    test('with seed -> boots past onboarding to Home', async ({ page, app }) => {
      await app.gotoDeep('/');
      await expect(page.getByText('How can I help you today?')).toBeVisible();
      await expect(
        page.getByText('I agree to the Terms of Service', { exact: false }),
      ).toHaveCount(0);
    });
  });
}

// ---------------------------------------------------------------------------
// chat: composer renders, accepts input, toolbar controls work
// ---------------------------------------------------------------------------
export function registerChat({ test, expect }: AppTest) {
  test.describe('chat', () => {
    test('home composer renders and accepts a message', async ({ page, app }) => {
      await app.gotoDeep('/');
      await expect(page.getByText('How can I help you today?')).toBeVisible();

      const composer = page.locator('textarea').first();
      await expect(composer).toBeVisible();
      await expect(composer).toHaveAttribute('placeholder', /Send a message/i);

      const msg = 'Hello from the deep E2E suite';
      await composer.click();
      await composer.fill(msg);
      await expect(composer).toHaveValue(msg);

      // Suggestion chips (prompt starters) are part of the empty-state Home.
      await expect(
        page.getByText('Negotiate My Salary Like a Pro', { exact: false }),
      ).toBeVisible();
    });

    test('composer toolbar exposes Tools and Add controls', async ({ page, app }) => {
      await app.gotoDeep('/');
      const composer = page.locator('textarea').first();
      await expect(composer).toBeVisible();

      const toolsBtn = page.getByRole('button', { name: /^Tools$/ }).first();
      await expect(toolsBtn).toBeVisible();
      await toolsBtn.click();
      await page.waitForTimeout(300);
      // Interaction must not crash the app into the error boundary.
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await page.keyboard.press('Escape').catch(() => {});

      // Composer survives the interaction and remains usable.
      await expect(composer).toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// add-ai: model-provider select (incl. native <Brand> Engine), form fields
// ---------------------------------------------------------------------------
export function registerAddAi({ test, expect }: AppTest) {
  test.describe('add-ai', () => {
    test('model provider select lists the native engine + cloud providers', async ({
      page,
      app,
    }) => {
      await app.gotoDeep('/add-ai');
      await expect(page.getByText('Add AI', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('Model Provider', { exact: false })).toBeVisible();

      const select = page.locator('select').first();
      await expect(select).toBeVisible();
      const options = await select.locator('option').allInnerTexts();
      // Native local engine is brand-specific (e.g. "Zoo Engine (Local)").
      expect(options.some((o) => o.includes(`${app.engineLabel}`))).toBeTruthy();
      // Cloud providers are brand-agnostic.
      for (const provider of ['OpenAI', 'Claude', 'Gemini']) {
        expect(options.some((o) => o.includes(provider))).toBeTruthy();
      }
    });

    test('selecting OpenAI reveals URL/API-key fields and form accepts input', async ({
      page,
      app,
    }) => {
      await app.gotoDeep('/add-ai');
      const select = page.locator('select').first();
      await expect(select).toBeVisible();

      await select.selectOption({ label: 'OpenAI' });
      await expect(select).toHaveValue(/.+/); // a concrete provider is now chosen

      const name = page.getByLabel('AI Name', { exact: false }).first();
      await expect(name).toBeVisible();
      await name.fill('My E2E Model');
      await expect(name).toHaveValue('My E2E Model');

      const url = page.getByLabel('External URL', { exact: false }).first();
      await expect(url).toBeVisible();
      await url.fill('http://127.0.0.1:11434');
      await expect(url).toHaveValue('http://127.0.0.1:11434');

      await expect(page.getByText('API Key', { exact: false }).first()).toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// agents: My Agents / Explore tabs, Import + Add Agent actions
// ---------------------------------------------------------------------------
export function registerAgents({ test, expect }: AppTest) {
  test.describe('agents', () => {
    test('tabs switch between My Agents and Explore', async ({ page, app }) => {
      await app.gotoDeep('/agents');
      await expect(page.getByText('Agents', { exact: false }).first()).toBeVisible();

      const myAgents = page.getByRole('tab', { name: /My Agents/i });
      const explore = page.getByRole('tab', { name: /Explore/i });
      await expect(myAgents).toBeVisible();
      await expect(explore).toBeVisible();

      // My Agents empty-state.
      await expect(page.getByText('No available agents', { exact: false })).toBeVisible();

      await explore.click();
      await expect(explore).toHaveAttribute('aria-selected', 'true');

      await myAgents.click();
      await expect(myAgents).toHaveAttribute('aria-selected', 'true');
    });

    test('Add Agent navigates to the agent builder', async ({ page, app }) => {
      await app.gotoDeep('/agents');
      const addAgent = page.getByRole('button', { name: /Add Agent/i }).first();
      await expect(addAgent).toBeVisible();
      await expect(page.getByRole('button', { name: /Import/i }).first()).toBeVisible();

      await addAgent.click();
      // Lands on the multi-step agent builder.
      await expect
        .poll(async () => {
          const url = page.url();
          const txt = await app.bodyText();
          return /add-agent/.test(url) || /Persona|Create New Agent/i.test(txt);
        }, { timeout: 15_000 })
        .toBeTruthy();
    });
  });
}

// ---------------------------------------------------------------------------
// tools: list, category filters, Import Tool / New Tool, AI Store link
// ---------------------------------------------------------------------------
export function registerTools({ test, expect }: AppTest) {
  test.describe('tools', () => {
    test('tools page lists controls and category filters', async ({ page, app }) => {
      await app.gotoDeep('/tools');
      await expect(page.getByText('Tools', { exact: false }).first()).toBeVisible();
      await expect(
        page.getByText('Manage, customize, and expand your AI tools', { exact: false }),
      ).toBeVisible();

      await expect(page.getByRole('button', { name: /Import Tool/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /New Tool/i }).first()).toBeVisible();
      await expect(page.getByText('Explore AI Store', { exact: false }).first()).toBeVisible();

      for (const cat of ['All', 'Default Tools', 'My Tools', 'Downloaded']) {
        await expect(page.getByText(cat, { exact: false }).first()).toBeVisible();
      }
    });

    test('New Tool navigates to the tool creator', async ({ page, app }) => {
      await app.gotoDeep('/tools');
      const newTool = page.getByRole('button', { name: /New Tool/i }).first();
      await expect(newTool).toBeVisible();
      await newTool.click();
      await expect
        .poll(async () => /tools\/create/.test(page.url()) ||
          /Something went wrong/.test(await app.bodyText()) === false &&
            page.url() !== `${app.baseURL}/tools`,
          { timeout: 10_000 })
        .toBeTruthy();
      // Did not crash into the error boundary.
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    });
  });
}

// ---------------------------------------------------------------------------
// settings: each working sub-route heading + nav, with in-app navigation
// ---------------------------------------------------------------------------
export function registerSettings({ test, expect }: AppTest) {
  const routes: Array<{ path: string; heading: RegExp; marker: RegExp }> = [
    { path: '/settings/appearance', heading: /Appearance/, marker: /Chat font/i },
    { path: '/settings/shortcuts', heading: /Shortcuts/, marker: /keyboard shortcuts/i },
    { path: '/settings/remote-access', heading: /Remote Access/, marker: /ngrok/i },
    { path: '/settings/analytics-settings', heading: /Analytics/, marker: /Help us improve/i },
    { path: '/settings/export-connection', heading: /Export Connection/, marker: /Passphrase/i },
    { path: '/settings/public-keys', heading: /Public Keys/, marker: /Node Public Keys/i },
    { path: '/settings/prompt-library', heading: /Prompt Library/, marker: /New Prompt/i },
  ];

  test.describe('settings', () => {
    for (const { path, heading, marker } of routes) {
      test(`renders ${path}`, async ({ page, app }) => {
        await app.gotoDeep(path);
        await expect(page.getByText(heading).first()).toBeVisible();
        await expect(page.getByText(marker).first()).toBeVisible();
        // Settings nav rail is present on every sub-route.
        for (const tab of ['General', 'Appearance', 'Shortcuts', 'Remote Access', 'Analytics']) {
          await expect(page.getByText(tab, { exact: false }).first()).toBeVisible();
        }
      });
    }

    test('settings nav navigates between sub-routes', async ({ page, app }) => {
      await app.gotoDeep('/settings/appearance');
      await expect(page.getByText('Chat font', { exact: false })).toBeVisible();

      await page.getByRole('link', { name: /^Shortcuts$/ }).first().click();
      await expect
        .poll(() => page.url(), { timeout: 10_000 })
        .toMatch(/\/settings\/shortcuts/);
      await expect(page.getByText('keyboard shortcuts', { exact: false })).toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// files (vector-fs): AI Files Explorer renders, Add New control
// ---------------------------------------------------------------------------
export function registerFiles({ test, expect }: AppTest) {
  test.describe('files', () => {
    test('AI Files Explorer renders with empty-state and Add New', async ({ page, app }) => {
      await app.gotoDeep('/vector-fs');
      await expect(page.getByText('AI Files Explorer', { exact: false })).toBeVisible();
      await expect(
        page.getByText('This will be the home for all your files', { exact: false }),
      ).toBeVisible();
      await expect(page.getByText('No files found', { exact: false })).toBeVisible();

      const addNew = page.getByRole('button', { name: /Add New/i }).first();
      await expect(addNew).toBeVisible();
      await addNew.click();
      await page.waitForTimeout(300);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    });
  });
}

// ---------------------------------------------------------------------------
// ais: Manage AIs page renders with empty-state + Add AI
// ---------------------------------------------------------------------------
export function registerAis({ test, expect }: AppTest) {
  test.describe('ais', () => {
    test('Manage AIs renders empty-state and Add AI', async ({ page, app }) => {
      await app.gotoDeep('/ais');
      await expect(page.getByText('Manage AIs', { exact: false })).toBeVisible();
      await expect(page.getByText('No available AIs', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: /Add AI/i }).first()).toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// brand: own brand present, foreign brands absent in visible text
// ---------------------------------------------------------------------------
export function registerBrand({ test, expect }: AppTest) {
  test.describe('brand', () => {
    test('document title and brand nav reflect this brand', async ({ page, app }) => {
      await app.gotoDeep('/');
      await expect(page).toHaveTitle(app.titleRe);
      await expect(page.getByText(`Get Started with ${app.brand}`, { exact: false })).toBeVisible();
    });

    test('no foreign brand leaks into visible UI text', async ({ app }) => {
      if (app.foreign.length === 0) {
        test.skip(true, 'this brand has no foreign-brand constraint');
        return;
      }
      const routes = ['/', '/ais', '/add-ai', '/tools', '/settings/appearance'];
      for (const route of routes) {
        await app.gotoDeep(route);
        const text = await app.bodyText();
        for (const brand of app.foreign) {
          expect(
            text.includes(brand),
            `route ${route} visible text must not contain foreign brand "${brand}"`,
          ).toBeFalsy();
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// regressions: routes blocked by pre-existing bundle bugs in the current dist
// (documented, not asserted-as-good). Unskip once the bundle is fixed.
// ---------------------------------------------------------------------------
export function registerRegressions({ test }: AppTest) {
  test.describe('regressions (known-blocked)', () => {
    test.fixme(
      '/inboxes — chat-list query maps over undefined in current bundle',
      async ({ app }) => {
        await app.gotoDeep('/inboxes');
      },
    );
    test.fixme(
      '/settings (General index) — TDZ "Cannot access before initialization" in current bundle',
      async ({ app }) => {
        await app.gotoDeep('/settings');
      },
    );
  });
}

export function registerAll(appTest: AppTest) {
  registerOnboarding(appTest);
  registerChat(appTest);
  registerAddAi(appTest);
  registerAgents(appTest);
  registerTools(appTest);
  registerSettings(appTest);
  registerFiles(appTest);
  registerAis(appTest);
  registerBrand(appTest);
  registerRegressions(appTest);
}
