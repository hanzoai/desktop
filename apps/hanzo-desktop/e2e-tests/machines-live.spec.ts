// Copyright (C) 2024-2026, Hanzo AI, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// Visual proof that the /machines page renders the live demo VM.
// We snapshot the data the running zood daemon exposes (via the host file
// at ~/.hanzo/machines/demo/state.json) and inject it through the same
// Tauri-mock seam machines.spec.ts uses, then screenshot the result.

import { execSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

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

const liveMachines = (): FixtureMachine[] => {
  const out = execSync(
    '/tmp/zood-pure machine list --json 2>/dev/null',
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
};

const installTauriMock = async (
  page: Page,
  machines: FixtureMachine[],
): Promise<void> => {
  await page.addInitScript((seed) => {
    type InvokeArgs = Record<string, unknown> | undefined;
    const list = [...(seed as FixtureMachine[])];
    const handlers: Record<string, (args: InvokeArgs) => unknown> = {
      machine_health: () => ({ ok: true, version: 'live' }),
      machine_list: () => list,
      machine_get: (args) => {
        const name = (args as { name: string } | undefined)?.name;
        const m = list.find((x) => x.name === name);
        if (!m) throw new Error('not found');
        return m;
      },
      machine_create: () => ({}),
      machine_start: () => undefined,
      machine_stop: () => undefined,
      machine_delete: () => undefined,
      machine_exec: () => '',
      machine_events_subscribe: () => undefined,
    };
    const internals = {
      invoke: async (cmd: string, args?: InvokeArgs) => {
        const h = handlers[cmd];
        if (!h) throw new Error(`unmocked Tauri command: ${cmd}`);
        return h(args);
      },
      transformCallback: (cb: unknown) => cb,
    };
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ =
      internals;
    (window as unknown as { __TAURI__: unknown }).__TAURI__ = internals;
  }, machines);
};

test.describe('Machines page (live)', () => {
  test('shows running demo VM and screenshots', async ({ page }) => {
    const machines = liveMachines();
    expect(machines.length).toBeGreaterThan(0);
    const demo = machines.find((m) => m.name === 'demo');
    expect(demo).toBeDefined();
    expect(demo?.state).toBe('running');
    expect(demo?.ip).toBeTruthy();

    await installTauriMock(page, machines);
    page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
    page.on('pageerror', (e) => console.log('[browser-error]', e.message));
    await page.goto('/machines');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    // Capture before assertions so we always have the artifact, even on failure.
    await page.screenshot({ path: 'test-results/machines-demo-running.png', fullPage: true });

    await expect(page.getByTestId('machine-row-demo')).toBeVisible();
    await expect(page.getByTestId('machine-row-demo')).toContainText('running');
  });
});
