/**
 * Let the web use a folder of this computer (hanzo-inc/app#310).
 *
 * The window names its computer through the os plugin (`plugin:os|hostname`), Settings → Machines finds the machine
 * `hanzo link` registered under that name, and Let the web use a folder… opens the window's own folder dialog
 * (`local_workspace_open_dialog`) and grants the folder chosen with the window's session. Every machine lists the
 * folders it shares, with Stop sharing; a refusal (anyone but the machine's owner) is said as the platform says it.
 * There is no Tauri runtime here, so the IPC is a stand-in that answers as the commands do, signed in with a token the
 * app reads from the keychain record, against a stubbed platform.
 */
import { expect, type Page, test } from '@playwright/test';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const expires = Math.floor(Date.now() / 1000) + 86_400;
const TOKEN = [
  b64({ alg: 'none', typ: 'JWT' }),
  b64({ sub: 'u1', name: 'James', email: 'james@acme.test', owner: 'acme', exp: expires, orgs: [{ org: 'acme', role: 'member' }], org: 'acme' }),
  'x',
].join('.');
// What identity_adopt answers: the shared sign-in's tokens (identity.rs).
const SESSION = { access_token: TOKEN };

const HOST = 'james-mbp.local';
const SHOP = '/Users/james/work/shop';

interface Platform {
  /** The folders tgt_1 shares, as the platform holds them. */
  folders: string[];
  /** What the folder routes were sent, in order. */
  sent: { method: string; body: unknown; query: string }[];
  /** The refusal the folder routes answer with, or '' to do as asked. */
  refuse: string;
}

/** A signed-in window on the computer `HOST`, whose folder dialog answers SHOP, and a platform with that machine and another. */
async function signedIn(page: Page, world: Platform): Promise<void> {
  await page.addInitScript(
    ({ session, host, shop }) => {
      let callback = 1;
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
        transformCallback(f: unknown) {
          const id = callback++;
          (window as unknown as Record<string, unknown>)[`_${id}`] = f;
          return id;
        },
        unregisterCallback() {},
        convertFileSrc: (p: string) => p,
        async invoke(cmd: string, args: Record<string, unknown>) {
          switch (cmd) {
            case 'identity_adopt':
              return session;
            case 'plugin:event|listen':
              return callback++;
            case 'plugin:os|hostname':
              return host;
            case 'local_workspace_open_dialog':
              return shop;
            case 'local_workspace_discover':
              return [];
            default:
              return null;
          }
        },
      };
    },
    { session: SESSION, host: HOST, shop: SHOP },
  );
  await page.route('**/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': ok\n\n' });
    if (path === '/v1/agent/targets' || path === '/v1/agents/targets') {
      const machine = (id: string, host: string, folders: string[]) => ({ id, label: host, host, kind: 'laptop', status: 'online', metricsAt: new Date().toISOString(), folders });
      return json({ targets: [machine('tgt_1', HOST, world.folders), machine('tgt_2', 'rack', ['/srv/app'])] });
    }
    if (path === '/v1/agent/targets/tgt_1/folders') {
      const body = req.postDataJSON() as { folder?: string } | null;
      world.sent.push({ method: req.method(), body, query: url.search });
      if (world.refuse) return json({ type: 'about:blank', title: 'Forbidden', status: 403, detail: world.refuse }, 403);
      if (req.method() === 'POST' && body?.folder) world.folders = [...world.folders, body.folder];
      if (req.method() === 'DELETE') world.folders = world.folders.filter((f) => f !== url.searchParams.get('folder'));
      return json({});
    }
    if (path === '/v1/agent/sessions' || path === '/v1/agents/sessions') return json({ sessions: [] });
    if (path.startsWith('/v1/agents/chat/conversations')) return json({ conversations: [] });
    if (path === '/v1/project') return json([]);
    return json({});
  });
}

const shared = (page: Page, host: string) => page.locator('[data-slot="shared"]').filter({ has: page.getByText(host === HOST ? 'Let the web use a folder…' : '/srv/app') });

test.describe('Let the web use a folder of this computer', () => {
  test('the machine that is this computer shares a folder chosen in the window’s own dialog, and stops sharing it', async ({ page }) => {
    const world: Platform = { folders: [], sent: [], refuse: '' };
    await signedIn(page, world);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/dev/machines');
    const share = page.getByRole('button', { name: 'Let the web use a folder…' });
    await expect(share).toHaveCount(1, { timeout: 60_000 });
    await share.click();
    await expect(shared(page, HOST)).toContainText(SHOP);
    expect(world.sent[0]).toMatchObject({ method: 'POST', body: { folder: SHOP } });
    await page.screenshot({ path: 'test-results/share-folder.png' });

    await page.getByRole('button', { name: `Stop sharing ${SHOP}` }).click();
    await expect(shared(page, HOST)).not.toContainText(SHOP);
    expect(world.sent[1]).toMatchObject({ method: 'DELETE', query: `?folder=${encodeURIComponent(SHOP)}` });
  });

  test('a refusal is said as the platform says it, and nothing is shown as shared', async ({ page }) => {
    const world: Platform = { folders: [], sent: [], refuse: "only the machine's owner may grant or revoke its folders" };
    await signedIn(page, world);
    await page.goto('/dev/machines');
    await page.getByRole('button', { name: 'Let the web use a folder…' }).click({ timeout: 60_000 });
    await expect(shared(page, HOST).getByRole('status')).toHaveText("only the machine's owner may grant or revoke its folders");
    await expect(shared(page, HOST)).not.toContainText(SHOP);
  });
});
