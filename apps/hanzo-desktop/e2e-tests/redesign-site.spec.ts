/**
 * Redesign a site from its address, through the window's own commands (hanzo-inc/app#312, hanzoai/desktop#15).
 *
 * The main window is hanzo.ai's app, and Dev's New on This computer offers to redesign an address pasted into it: the
 * window opens the site and saves a copy for the agent (`local_site_capture`), serves the folder's `redesign/` live
 * (`local_preview_start`) and shows it in Chrome (`local_preview_open`), and the agent is the ordinary
 * `local_workspace_run_dev`. There is no Tauri runtime in this suite, so the IPC is a stand-in that answers the way
 * the Rust commands do and writes every call down; the Rust side is `cargo test local_site`. Signed in with a token
 * the app adopts from the shared sign-in (`identity_adopt`), against a stubbed platform.
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

type Call = { cmd: string; args: Record<string, unknown> };

/** A signed-in window whose IPC is a stand-in for the desktop's commands. `refuse` is what `local_site_capture` says no with. */
async function signedIn(page: Page, refuse = ''): Promise<Call[]> {
  const calls: Call[] = [];
  await page.exposeFunction('__ipc', (call: Call) => calls.push(call));
  await page.addInitScript(
    ({ session, refuse }) => {
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
          (window as unknown as { __ipc: (c: unknown) => void }).__ipc({ cmd, args });
          switch (cmd) {
            case 'identity_adopt':
              return session;
            case 'plugin:event|listen':
              return callback++;
            case 'local_site_folder':
              return { name: args.name, path: `/Users/james/Documents/Hanzo/${args.name}` };
            case 'local_site_capture':
              if (refuse) throw refuse;
              return { title: 'Acme Plumbing', url: args.url, files: ['page.html', 'text.md'], screenshot: false };
            case 'local_preview_start':
              return { url: 'http://127.0.0.1:9933/', port: 9933 };
            case 'local_workspace_run_dev':
              return { session_id: 's1', output: 'The page hides its call to action. I rebuilt it around one clear button.', process: '', success: true };
            case 'local_workspace_discover':
              return [];
            default:
              return null;
          }
        },
      };
      localStorage.setItem('hanzo.local_workspaces', JSON.stringify([{ id: 'w1', name: 'shop', path: '/Users/james/work/shop', addedAt: 1, lastOpenedAt: 5 }]));
    },
    { session: SESSION, refuse },
  );
  await page.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': ok\n\n' });
    if (path === '/v1/agent/sessions' || path === '/v1/agents/sessions') return json({ sessions: [] });
    if (path === '/v1/agent/targets' || path === '/v1/agents/targets') return json({ targets: [] });
    if (path.startsWith('/v1/agents/chat/conversations')) return json({ conversations: [] });
    if (path === '/v1/project') return json([]);
    return json({});
  });
  return calls;
}

const sidebar = (calls: Call[]) => calls.map((c) => c.cmd).filter((c) => /^local_(site|preview|workspace_run)/.test(c));

test.describe('Redesign a site in Hanzo Desktop', () => {
  test('an address pasted in Dev is offered as a redesign, and one press does all of it through the window’s commands', async ({ page }) => {
    const calls = await signedIn(page);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/dev');
    const ask = page.getByPlaceholder(/Ask, build/);
    await ask.fill('https://www.acme.com/plumbing', { timeout: 60_000 });
    const offer = page.locator('[data-slot="redesign-offer"]');
    await expect(offer).toContainText('Redesign acme.com?');
    await page.screenshot({ path: 'test-results/redesign-offer.png' });

    await offer.getByRole('button', { name: 'Redesign this site' }).click();
    const card = page.locator('[data-slot="redesign"]');
    await expect(card).toContainText('Redesigned acme.com', { timeout: 15_000 });
    await expect(card).toContainText('Live preview: http://127.0.0.1:9933/');
    await expect(card).toContainText('The page hides its call to action. I rebuilt it around one clear button.');
    await page.screenshot({ path: 'test-results/redesign-done.png' });

    // The window's commands, in order: a new folder named for the site, the site saved into it, the redesign served and shown, the agent run there.
    expect(sidebar(calls)).toEqual(['local_site_folder', 'local_site_capture', 'local_preview_start', 'local_preview_open', 'local_workspace_run_dev']);
    const [folder, capture, start, open, run] = ['local_site_folder', 'local_site_capture', 'local_preview_start', 'local_preview_open', 'local_workspace_run_dev'].map(
      (cmd) => calls.find((c) => c.cmd === cmd)!,
    );
    const dir = '/Users/james/Documents/Hanzo/acme-redesign';
    expect(folder.args).toEqual({ name: 'acme-redesign' });
    expect(capture.args).toEqual({ url: 'https://www.acme.com/plumbing', dir });
    expect(start.args).toEqual({ dir });
    expect(open.args).toEqual({ url: 'http://127.0.0.1:9933/' });
    expect(run.args.workspacePath).toBe(dir);
    expect(String(run.args.prompt)).toContain('Redesign the website https://www.acme.com/plumbing (Acme Plumbing).');
    expect(String(run.args.prompt)).toContain('- .hanzo/reference/text.md:');
    expect(String(run.args.prompt)).toContain('Do not start a server and do not use the network');

    // Open in Chrome shows the same address again.
    await card.getByRole('button', { name: 'Open in Chrome' }).click();
    await expect.poll(() => calls.filter((c) => c.cmd === 'local_preview_open').length).toBe(2);
    // The redesign's folder is now the one Auto picks.
    await expect(page.getByRole('button', { name: /^Folder: / })).toHaveAccessibleName('Folder: Auto · acme-redesign');
  });

  test('a site the window will not open is said in plain words, and no agent is run', async ({ page }) => {
    const calls = await signedIn(page, 'Hanzo opens sites on the internet, or one running on this computer. That address is on a private network.');
    await page.goto('/dev');
    await page.getByPlaceholder(/Ask, build/).fill('http://192.168.1.10/', { timeout: 60_000 });
    await page.getByPlaceholder(/Ask, build/).press('Enter');
    const card = page.locator('[data-slot="redesign"]');
    await expect(card).toContainText('Could not redesign 192.168.1.10');
    await expect(card).toContainText('That address is on a private network.');
    expect(sidebar(calls)).toEqual(['local_site_folder', 'local_site_capture']);
    await page.screenshot({ path: 'test-results/redesign-refused.png' });
  });

  test('an ask that only holds a link is a normal run in the folder', async ({ page }) => {
    const calls = await signedIn(page);
    await page.goto('/dev');
    const ask = page.getByPlaceholder(/Ask, build/);
    await ask.fill('What does https://www.acme.com say about pricing?', { timeout: 60_000 });
    await expect(page.locator('[data-slot="redesign-offer"]')).toHaveCount(0);
    await ask.press('Enter');
    await expect.poll(() => sidebar(calls)).toEqual(['local_workspace_run_dev']);
  });
});
