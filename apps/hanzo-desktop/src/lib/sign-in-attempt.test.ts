import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { awaitCallback, type Callback, EXPIRED_MESSAGE, SignInCancelled } from './sign-in-attempt';

/** A stand-in for the Tauri event: who is subscribed, and a way to fire it. */
function bus() {
  const subs = new Set<(cb: Callback) => void>();
  return {
    subs,
    listen: vi.fn(async (on: (cb: Callback) => void) => {
      subs.add(on);
      return () => subs.delete(on);
    }),
    fire: (cb: Callback) => [...subs].forEach((on) => on(cb)),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('a sign-in attempt', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('opens the page once subscribed, and resolves on its own callback', async () => {
    const b = bus();
    const open = vi.fn(async () => undefined);
    const done = awaitCallback({ state: 's1', listen: b.listen, open, windowMs: 1000 });
    await flush();
    expect(open).toHaveBeenCalledTimes(1);
    b.fire({ state: 's1', code: 'c1' });
    await expect(done).resolves.toEqual({ state: 's1', code: 'c1' });
    expect(b.subs.size).toBe(0);
  });

  it('Cancel rejects at once, removes the listener and stops the timer', async () => {
    const b = bus();
    const ctrl = new AbortController();
    const done = awaitCallback({ state: 's1', listen: b.listen, open: async () => undefined, windowMs: 1000, signal: ctrl.signal });
    await flush();
    expect(b.subs.size).toBe(1);
    ctrl.abort();
    await expect(done).rejects.toBeInstanceOf(SignInCancelled);
    expect(b.subs.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Cancel before the subscription lands still leaves no listener behind', async () => {
    const b = bus();
    const ctrl = new AbortController();
    const open = vi.fn(async () => undefined);
    const done = awaitCallback({ state: 's1', listen: b.listen, open, windowMs: 1000, signal: ctrl.signal });
    ctrl.abort();
    await expect(done).rejects.toBeInstanceOf(SignInCancelled);
    await flush();
    expect(b.subs.size).toBe(0);
    expect(open).not.toHaveBeenCalled();
  });

  it('an already-cancelled signal never subscribes', async () => {
    const b = bus();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      awaitCallback({ state: 's1', listen: b.listen, open: async () => undefined, windowMs: 1000, signal: ctrl.signal }),
    ).rejects.toBeInstanceOf(SignInCancelled);
    expect(b.listen).not.toHaveBeenCalled();
  });

  it('a retry is not finished by a late callback from the cancelled attempt', async () => {
    const b = bus();
    const first = new AbortController();
    const one = awaitCallback({ state: 's1', listen: b.listen, open: async () => undefined, windowMs: 1000, signal: first.signal });
    await flush();
    first.abort();
    await expect(one).rejects.toBeInstanceOf(SignInCancelled);

    const two = awaitCallback({ state: 's2', listen: b.listen, open: async () => undefined, windowMs: 1000 });
    await flush();
    // The first browser tab is finished after all: its state is not this attempt's.
    b.fire({ state: 's1', code: 'stale' });
    await flush();
    expect(b.subs.size).toBe(1);
    b.fire({ state: 's2', code: 'fresh' });
    await expect(two).resolves.toEqual({ state: 's2', code: 'fresh' });
  });

  it('gives up with a sentence when the window closes', async () => {
    const b = bus();
    const done = awaitCallback({ state: 's1', listen: b.listen, open: async () => undefined, windowMs: 1000 });
    const seen = expect(done).rejects.toThrow(EXPIRED_MESSAGE);
    await vi.advanceTimersByTimeAsync(1001);
    await seen;
    expect(b.subs.size).toBe(0);
  });

  it('a browser that will not open fails the attempt and unsubscribes', async () => {
    const b = bus();
    const done = awaitCallback({
      state: 's1',
      listen: b.listen,
      open: async () => {
        throw new Error('no browser');
      },
      windowMs: 1000,
    });
    await expect(done).rejects.toThrow('no browser');
    expect(b.subs.size).toBe(0);
  });
});
