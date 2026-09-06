// Deep E2E fixture for the @hanzo/ai desktop SDK as embedded by a brand app.
//
// The apps gate on (1) onboarding completion and (2) node health. This fixture
// lifts BOTH gates against a built `dist/` with zero native backend:
//   - serves dist over http with SPA fallback (worker-scoped server)
//   - mocks the Tauri host (window.__TAURI_INTERNALS__) so invoke() resolves
//     benign defaults instead of throwing
//   - pre-seeds the persisted Zustand `auth` + `settings` localStorage so the
//     app boots PAST onboarding to Home (gotoDeep), or omits it to land on the
//     onboarding gate (gotoFresh)
//   - Playwright-routes the node HTTP API: health_check -> healthy, list
//     endpoints -> [], object endpoints -> {}
//
// One factory, parameterized by brand + dist path, so every brand app reuses
// the identical flow specs and only the brand metadata varies.
import { test as base, expect, type Page } from '@playwright/test';
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

export type AppOptions = {
  /** Absolute path to the built Vite dist/ for this brand app. */
  distPath: string;
  /** Brand display name as rendered in-app, e.g. "Zoo" / "Lux" / "Hanzo". */
  brand: string;
  /** Native local-engine option label in Add AI, e.g. "Zoo Engine". */
  engineLabel: string;
  /** Document <title> matcher, e.g. /Zoo/i. */
  titleRe: RegExp;
  /** Brand names that MUST NOT leak into this app's visible UI text. */
  foreign: string[];
};

export type App = AppOptions & {
  baseURL: string;
  page: Page;
  /** Seed completed-onboarding + valid auth, then navigate -> authed UI. */
  gotoDeep: (route: string) => Promise<void>;
  /** Navigate with NO auth seed -> onboarding gate. */
  gotoFresh: (route: string) => Promise<void>;
  /** Concatenated visible body text, whitespace-collapsed. */
  bodyText: () => Promise<string>;
};

type ServerHandle = { baseURL: string; close: () => Promise<void> };

function startServer(distPath: string): Promise<ServerHandle> {
  if (!existsSync(join(distPath, 'index.html'))) {
    throw new Error(
      `dist not built: ${join(distPath, 'index.html')} is missing — build the app first`,
    );
  }
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(distPath, urlPath);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(distPath, 'index.html'); // SPA fallback for client routes
    }
    try {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// Persisted-store seed: completed onboarding + valid-looking auth. Keys/shape
// are SDK-level (shared across brands), so this works for every brand app.
function seedScript(baseURL: string) {
  return {
    auth: {
      state: {
        auth: {
          profile: 'main',
          node_address: baseURL,
          hanzo_identity: '@@e2e.localhost',
          encryption_pk: '00'.repeat(32),
          identity_pk: '00'.repeat(32),
          api_v2_key: 'e2e-key',
        },
      },
      version: 0,
    },
    settings: {
      state: {
        onboarding: {
          steps: {
            'terms-conditions': { completed: true, choice: true },
            analytics: { completed: true, choice: false },
          },
        },
      },
      version: 0,
    },
  };
}

// Tauri host shim — resolve benign defaults so node-manager/invoke code paths
// execute instead of throwing in a non-Tauri (browser) context.
async function installTauriMock(page: Page) {
  await page.addInitScript(() => {
    const invoke = async (cmd: string) => {
      if (/is_running|health/.test(cmd)) return false;
      return null;
    };
    // @ts-expect-error injected host
    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: (c: unknown) => c,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
    };
    // @ts-expect-error injected host
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: async () => {} };
  });
}

// Mock the node HTTP API so the node-health gate passes and queries resolve.
async function installNodeRoute(page: Page, baseURL: string) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(baseURL)) return route.continue(); // external -> untouched
    const path = new URL(url).pathname;
    if (/health_check/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          node_name: '@@e2e.localhost',
          is_pristine: false,
          version: '1.0.0',
          update_requires_reset: false,
        }),
      });
    }
    if (/\/(v1|v2)\//.test(path)) {
      // object-shaped endpoints -> {}; list/iterable endpoints -> []
      const isObject =
        /(node_name|public_key|encryption|preferences|settings|default_|storage_location|wallet_balance|node_info)/.test(
          path,
        );
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: isObject ? '{}' : '[]',
      });
    }
    return route.continue(); // same-origin static assets -> served from dist
  });
}

async function waitReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  // SPA mounted when #root has rendered children.
  await page.locator('#root *').first().waitFor({ state: 'attached', timeout: 30_000 });
}

export type AppTest = {
  test: ReturnType<typeof base.extend<{ app: App }, { server: ServerHandle }>>;
  expect: typeof expect;
};

export function makeApp(opts: AppOptions): AppTest {
  const test = base.extend<{ app: App }, { server: ServerHandle }>({
    server: [
      // eslint-disable-next-line no-empty-pattern
      async ({}, use) => {
        const handle = await startServer(opts.distPath);
        await use(handle);
        await handle.close();
      },
      { scope: 'worker' },
    ],

    baseURL: async ({ server }, use) => {
      await use(server.baseURL);
    },

    app: async ({ page, server }, use) => {
      const baseURL = server.baseURL;
      await installTauriMock(page);
      await installNodeRoute(page, baseURL);

      let seeded = false;
      const seed = async () => {
        if (seeded) return;
        await page.addInitScript((s) => {
          for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
        }, seedScript(baseURL));
        seeded = true;
      };

      const gotoDeep = async (route: string) => {
        await seed();
        await page.goto(baseURL + route, { waitUntil: 'domcontentloaded' });
        await waitReady(page);
      };
      const gotoFresh = async (route: string) => {
        await page.goto(baseURL + route, { waitUntil: 'domcontentloaded' });
        await waitReady(page);
      };
      const bodyText = async () =>
        (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

      await use({
        ...opts,
        baseURL,
        page,
        gotoDeep,
        gotoFresh,
        bodyText,
      });
    },
  });

  return { test, expect };
}
