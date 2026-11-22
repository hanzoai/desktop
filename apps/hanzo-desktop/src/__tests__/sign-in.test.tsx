/** The browser sign-in gives up after 15 minutes and lets go of its listener; the Tauri calls are replaced. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(async () => 4321),
  unlisten: vi.fn(),
  listen: vi.fn(),
  openUrl: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: tauri.openUrl }));
vi.mock('../utils/tauri-check', () => ({
  isTauriAvailable: () => true,
  safeInvoke: vi.fn(async () => null),
  safeListen: tauri.listen,
}));

import { signIn } from '../sign-in';

const sdk = {
  config: { redirectUri: '' },
  getSigninUrl: vi.fn(async () => 'https://iam.test/authorize?state=s'),
  handleCallback: vi.fn(async () => undefined),
} as unknown as Parameters<typeof signIn>[0];

describe('signing in through the browser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tauri.unlisten.mockClear();
    tauri.listen.mockReset().mockResolvedValue(tauri.unlisten);
  });
  afterEach(() => vi.useRealTimers());

  it('gives up after 15 minutes with nobody back, and releases its listener', async () => {
    const result = signIn(sdk).then(
      () => 'resolved',
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1);
    expect(tauri.listen).toHaveBeenCalledTimes(1);
    expect(tauri.unlisten).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatch(/^Sign-in was not finished/);
    expect(tauri.unlisten).toHaveBeenCalledTimes(1);
  });
});
