import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type EngineInfo,
  useDiscoverEnginesQuery,
  useEngineProbeMutation,
} from '../engines-client';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

const engineFixture = (overrides: Partial<EngineInfo> = {}): EngineInfo => ({
  name: 'evo',
  host: 'evo.local',
  ip: '10.0.0.144',
  port: 1240,
  models: ['Qwen3-0.6B'],
  version: '1.7.18',
  latency_ms: 3,
  base_url: 'http://10.0.0.144:1240/v1',
  ...overrides,
});

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

const newClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

beforeEach(() => {
  invokeMock.mockReset();
});

describe('useDiscoverEnginesQuery', () => {
  it('returns engines from the engines_discover command', async () => {
    const engines = [
      engineFixture(),
      engineFixture({ name: 'spark', port: 1241 }),
    ];
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'engines_discover') return engines;
      throw new Error('unexpected: ' + cmd);
    });

    const { result } = renderHook(() => useDiscoverEnginesQuery(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.data).toEqual(engines));
    expect(invokeMock).toHaveBeenCalledWith('engines_discover', undefined);
  });
});

describe('useEngineProbeMutation', () => {
  it('probes a url and returns engine info', async () => {
    const engine = engineFixture({ latency_ms: 12 });
    invokeMock.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === 'engine_probe') {
        expect(args).toEqual({ url: 'http://localhost:1234' });
        return engine;
      }
      throw new Error('unexpected: ' + cmd);
    });

    const { result } = renderHook(() => useEngineProbeMutation(), {
      wrapper: wrapper(newClient()),
    });

    let probed: EngineInfo | undefined;
    await act(async () => {
      probed = await result.current.mutateAsync('http://localhost:1234');
    });

    expect(probed).toEqual(engine);
    expect(invokeMock).toHaveBeenCalledWith('engine_probe', {
      url: 'http://localhost:1234',
    });
  });
});
