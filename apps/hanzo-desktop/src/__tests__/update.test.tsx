/** The bar's update mark through the plugin calls it makes; the Tauri plugins are replaced. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(async () => undefined),
  invoke: vi.fn(async () => undefined),
  platform: vi.fn(() => 'macos'),
  log: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({ check: plugin.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: plugin.relaunch }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: plugin.platform }));
vi.mock('@tauri-apps/plugin-log', () => ({ error: plugin.log }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: plugin.invoke }));
vi.mock('../utils/tauri-check', () => ({ isTauriAvailable: () => true }));

import { GuiProvider } from '@hanzo/gui';

import config from '../../gui.config';
import { percent, say, Update } from '../update';

type Event = { event: 'Started'; data: { contentLength: number } } | { event: 'Progress'; data: { chunkLength: number } } | { event: 'Finished' };

function release(play: (emit: (e: Event) => void) => Promise<void>) {
  return {
    available: true,
    version: '1.2.0',
    download: vi.fn(async (onEvent: (e: Event) => void) => play(onEvent)),
    install: vi.fn(async () => {
      order.push('install');
    }),
  };
}

/** What reached the app, in order: commands invoked and the install. */
let order: string[] = [];

const mount = () =>
  render(
    <GuiProvider config={config} defaultTheme="dark">
      <Update />
    </GuiProvider>,
  );

/** Let the first check answer. */
async function opened() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('the update mark', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const m of [plugin.check, plugin.relaunch, plugin.invoke]) m.mockClear();
    order = [];
    plugin.invoke.mockImplementation(async (cmd: string) => {
      order.push(cmd);
    });
    plugin.platform.mockReturnValue('macos');
  });
  afterEach(() => vi.useRealTimers());

  it('says nothing when the feed has nothing newer', async () => {
    plugin.check.mockResolvedValue(null);
    mount();
    await opened();
    expect(plugin.check).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Update/)).toBeNull();
  });

  it('says nothing when the feed cannot be read', async () => {
    plugin.check.mockRejectedValue(new Error('offline'));
    mount();
    await opened();
    expect(screen.queryByText(/Update/)).toBeNull();
    // Silent in the bar, not in the log: a check that cannot run is findable.
    expect(plugin.log).toHaveBeenCalledWith('update check failed: offline');
  });

  it('shows one quiet line for a newer version, and asks again every half hour', async () => {
    plugin.check.mockResolvedValue(release(async () => undefined));
    mount();
    await opened();
    const mark = screen.getByRole('button', { name: /Hanzo 1\.2\.0 is ready/ });
    expect(mark).toHaveTextContent('Update available');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    });
    expect(plugin.check).toHaveBeenCalledTimes(2);
  });

  it('installs on one press: progress, the model and node stopped, Hanzo opened again', async () => {
    let step: (e: Event) => void = () => undefined;
    let finish: () => void = () => undefined;
    plugin.check.mockResolvedValue(
      release(
        (emit) =>
          new Promise<void>((resolve) => {
            step = emit;
            finish = resolve;
          }),
      ),
    );
    mount();
    await opened();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /is ready/ }));
    });
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    await act(async () => {
      step({ event: 'Started', data: { contentLength: 200 } });
      step({ event: 'Progress', data: { chunkLength: 50 } });
    });
    expect(screen.getByText('Updating… 25%')).toBeInTheDocument();
    await act(async () => {
      step({ event: 'Finished' });
      finish();
    });
    // The model is stopped before the installer runs, which on Windows ends
    // this process without the exit hook.
    expect(order).toEqual(['local_models_cancel', 'local_models_stop', 'hanzo_node_kill', 'install']);
    expect(plugin.relaunch).toHaveBeenCalledTimes(1);
  });

  it('leaves the restart to the installer on Windows', async () => {
    plugin.platform.mockReturnValue('windows');
    plugin.check.mockResolvedValue(release(async () => undefined));
    mount();
    await opened();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /is ready/ }));
    });
    expect(order).toEqual(['local_models_cancel', 'local_models_stop', 'hanzo_node_kill', 'install']);
    expect(plugin.relaunch).not.toHaveBeenCalled();
  });

  it('calls a model download off and waits for it to clear up before installing', async () => {
    plugin.platform.mockReturnValue('windows');
    let polls = 0;
    plugin.invoke.mockImplementation(async (cmd: string) => {
      order.push(cmd);
      if (cmd === 'local_models_cancel') return true;
      if (cmd === 'local_models_status') return { pulling: ++polls < 3 ? 'zenlm/zen-nano-0.6b' : null };
      return undefined;
    });
    plugin.check.mockResolvedValue(release(async () => undefined));
    mount();
    await opened();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /is ready/ }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(order).toEqual([
      'local_models_cancel',
      'local_models_status',
      'local_models_status',
      'local_models_status',
      'local_models_stop',
      'hanzo_node_kill',
      'install',
    ]);
  });

  it('says a failed install and can be pressed again', async () => {
    const rel = release(async () => {
      throw new Error('disk full');
    });
    plugin.check.mockResolvedValue(rel);
    mount();
    await opened();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /is ready/ }));
    });
    const again = screen.getByRole('button', { name: /could not be installed/ });
    expect(again).toHaveTextContent('Update didn’t finish. Try again');
    expect(plugin.log).toHaveBeenCalledWith('update to 1.2.0 failed: disk full');
    expect(plugin.relaunch).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(again);
    });
    expect(rel.download).toHaveBeenCalledTimes(2);
  });
});

describe('what the bar says', () => {
  it('reads progress as whole percent, and nothing until the size is known', () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(201, 200)).toBe(100);
    expect(percent(10, undefined)).toBeNull();
    expect(percent(10, 0)).toBeNull();
  });

  it('presses only while there is something to install or retry', () => {
    expect(say({ name: 'none' })).toBeNull();
    expect(say({ name: 'ready', version: '1.2.0' })?.press).toBe(true);
    expect(say({ name: 'updating', version: '1.2.0', percent: 5 })?.press).toBe(false);
    expect(say({ name: 'failed', version: '1.2.0' })?.press).toBe(true);
  });
});
