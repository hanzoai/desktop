/** The benchmark page reads the engine's settings and changes them only on a button press. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BenchmarkPage from '../pages/benchmark';

describe('BenchmarkPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has a Back, and opening it or editing a value writes nothing to the engine', async () => {
    const fetch = vi.fn(async (url: string) =>
      new Response(JSON.stringify(String(url).endsWith('/v1/lsa') ? { enabled: false } : {}), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    const onBack = vi.fn();

    render(<BenchmarkPage onBack={onBack} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.change(screen.getByDisplayValue('512'), { target: { value: '1024' } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const writes = fetch.mock.calls.filter(([, init]) => {
      const method = (init as RequestInit | undefined)?.method;
      return method && method !== 'GET';
    });
    expect(writes).toEqual([]);
    expect(screen.getByRole('button', { name: 'Enable LSA' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('benchmark-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  /** An engine whose chat fails, with `lsa` as its own LSA settings; every LSA write is recorded. */
  function failingEngine(lsa: { enabled: boolean; config: Record<string, number> | null }) {
    const writes: Array<{ method: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (String(url).endsWith('/v1/lsa')) {
          if (method === 'GET') return new Response(JSON.stringify(lsa), { status: 200 });
          writes.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
          return new Response('{}', { status: 200 });
        }
        if (String(url).includes('chat/completions')) throw new TypeError('Failed to fetch');
        return new Response('{}', { status: 200 });
      }),
    );
    return writes;
  }

  async function compare() {
    render(<BenchmarkPage />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(screen.getByText('⚡ Compare Full vs LSA'));
    await waitFor(() => expect(screen.getByText('⚡ Compare Full vs LSA')).toBeTruthy());
  }

  it('a comparison that fails puts back the engine’s own LSA settings, not the page’s', async () => {
    const own = { min_seq_len: 4096, top_k: 999 };
    const writes = failingEngine({ enabled: true, config: own });
    await compare();
    expect(writes.length).toBeGreaterThan(1);
    expect(writes.at(-1)).toEqual({ method: 'POST', body: own });
  });

  it('a comparison that fails leaves LSA on when the engine had it on with no config of its own', async () => {
    const writes = failingEngine({ enabled: true, config: null });
    await compare();
    expect(writes.at(-1)).toEqual({ method: 'POST', body: {} });
  });

  it('a comparison that fails leaves LSA off when the engine had it off', async () => {
    const writes = failingEngine({ enabled: false, config: null });
    await compare();
    expect(writes.at(-1)).toEqual({ method: 'DELETE', body: undefined });
  });
});
