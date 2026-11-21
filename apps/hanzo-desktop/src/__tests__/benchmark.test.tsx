/** The benchmark page reads the engine's settings and changes them only on a button press. */
import { act, fireEvent, render, screen } from '@testing-library/react';
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
});
