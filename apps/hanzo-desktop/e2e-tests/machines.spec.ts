import { test, expect, type Page } from '@playwright/test';

/**
 * Machines page E2E.
 *
 * The Tauri commands (machine_*) are mocked by injecting a fake
 * `__TAURI_INTERNALS__.invoke` before the bundle loads. The dev server must
 * be running on localhost:1420.
 */

interface FixtureMachine {
  name: string;
  state: string;
  distro: string;
  cpus: number;
  memory_mb: number;
  disk_gb: number;
  ip?: string;
  created_at: string;
}

const installTauriMock = async (
  page: Page,
  machines: FixtureMachine[],
): Promise<void> => {
  await page.addInitScript((seed) => {
    type InvokeArgs = Record<string, unknown> | undefined;
    const list = [...(seed as FixtureMachine[])];
    const handlers: Record<string, (args: InvokeArgs) => unknown> = {
      machine_health: () => ({ ok: true, version: 'test' }),
      machine_list: () => list,
      machine_get: (args) => {
        const name = (args as { name: string } | undefined)?.name;
        const m = list.find((x) => x.name === name);
        if (!m) throw new Error('not found');
        return m;
      },
      machine_create: (args) => {
        const spec = (args as { spec: FixtureMachine } | undefined)?.spec;
        if (!spec) throw new Error('no spec');
        const machine = {
          ...spec,
          state: 'creating',
          created_at: new Date().toISOString(),
        };
        list.push(machine);
        return machine;
      },
      machine_start: () => undefined,
      machine_stop: () => undefined,
      machine_delete: (args) => {
        const name = (args as { name: string } | undefined)?.name;
        const idx = list.findIndex((x) => x.name === name);
        if (idx >= 0) list.splice(idx, 1);
        return undefined;
      },
      machine_exec: () => 'exec-1',
      machine_events_subscribe: () => undefined,
    };

    const internals = {
      invoke: (cmd: string, args?: InvokeArgs) => {
        const fn = handlers[cmd];
        if (!fn) return Promise.reject(new Error('no handler: ' + cmd));
        try {
          return Promise.resolve(fn(args));
        } catch (e) {
          return Promise.reject(e);
        }
      },
      transformCallback: (cb: unknown) => cb,
    };
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ =
      internals;
    (window as unknown as { __TAURI__: unknown }).__TAURI__ = internals;
  }, machines);
};

const goToMachines = async (page: Page) => {
  await page.goto('/machines');
  await page.waitForLoadState('networkidle');
};

test.describe('Machines page', () => {
  test('shows empty state when no machines', async ({ page }) => {
    await installTauriMock(page, []);
    await goToMachines(page);
    await expect(page.getByText('No machines yet')).toBeVisible();
  });

  test('renders rows for each machine', async ({ page }) => {
    await installTauriMock(page, [
      {
        name: 'alpha',
        state: 'running',
        distro: 'ubuntu',
        cpus: 2,
        memory_mb: 2048,
        disk_gb: 20,
        ip: '10.0.0.2',
        created_at: '2026-04-01T00:00:00Z',
      },
      {
        name: 'beta',
        state: 'stopped',
        distro: 'alpine',
        cpus: 1,
        memory_mb: 512,
        disk_gb: 5,
        created_at: '2026-04-01T00:00:00Z',
      },
    ]);
    await goToMachines(page);
    await expect(page.getByTestId('machine-row-alpha')).toBeVisible();
    await expect(page.getByTestId('machine-row-beta')).toBeVisible();
  });

  test('opens create dialog from header button', async ({ page }) => {
    await installTauriMock(page, []);
    await goToMachines(page);
    await page.getByRole('button', { name: /New machine/ }).first().click();
    await expect(
      page.getByRole('dialog').getByText('New machine'),
    ).toBeVisible();
  });
});
