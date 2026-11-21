import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  useCreateMachine,
  useDeleteMachine,
  useMachine,
  useMachines,
  useStartMachine,
  useStopMachine,
} from '../queries';
import type { Machine, MachineEvent } from '../types';

type EventHandler = (event: { payload: MachineEvent }) => void;

const invokeMock = vi.fn();
const listenHandlers: Record<string, EventHandler> = {};
const listenMock = vi.fn(async (channel: string, handler: EventHandler) => {
  listenHandlers[channel] = handler;
  return () => {
    delete listenHandlers[channel];
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (channel: string, handler: EventHandler) =>
    listenMock(channel, handler),
}));

const machineFixture = (overrides: Partial<Machine> = {}): Machine => ({
  name: 'box',
  distro: 'ubuntu',
  cpus: 2,
  memory_mb: 2048,
  disk_gb: 20,
  state: 'running',
  created_at: '2026-01-01T00:00:00Z',
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
  listenMock.mockClear();
  for (const key of Object.keys(listenHandlers)) delete listenHandlers[key];
});

describe('useMachines', () => {
  it('returns the list from machine_list and subscribes to events', async () => {
    const machines = [machineFixture({ name: 'a' }), machineFixture({ name: 'b' })];
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'machine_list') return machines;
      if (cmd === 'machine_events_subscribe') return undefined;
      throw new Error('unexpected: ' + cmd);
    });

    const client = newClient();
    const { result } = renderHook(() => useMachines(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual(machines));
    expect(listenMock).toHaveBeenCalledWith(
      'machine://event',
      expect.any(Function),
    );
  });

  it('invalidates the list when a machine event fires', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'machine_list') return [];
      if (cmd === 'machine_events_subscribe') return undefined;
      throw new Error('unexpected: ' + cmd);
    });
    const client = newClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useMachines(), { wrapper: wrapper(client) });
    await waitFor(() =>
      expect(listenHandlers['machine://event']).toBeDefined(),
    );

    act(() => {
      listenHandlers['machine://event']({
        payload: { name: 'a', state: 'running', ts: 'now' },
      });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['machine.list'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['machine.get', 'a'] });
  });
});

describe('useMachine', () => {
  it('fetches a single machine by name', async () => {
    const m = machineFixture({ name: 'one' });
    invokeMock.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === 'machine_get') {
        const a = args as { name: string };
        expect(a.name).toBe('one');
        return m;
      }
      throw new Error('unexpected: ' + cmd);
    });

    const { result } = renderHook(() => useMachine('one'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.data).toEqual(m));
  });

  it('does not fire when name is undefined', async () => {
    invokeMock.mockResolvedValue(machineFixture());
    const { result } = renderHook(() => useMachine(undefined), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('mutations', () => {
  it('useCreateMachine calls machine_create and invalidates', async () => {
    const m = machineFixture({ name: 'new' });
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'machine_create') return m;
      throw new Error('unexpected: ' + cmd);
    });
    const client = newClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateMachine(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({
        name: 'new',
        distro: 'ubuntu',
        cpus: 2,
        memory_mb: 2048,
        disk_gb: 20,
      });
    });
    expect(invokeMock).toHaveBeenCalledWith('machine_create', {
      spec: {
        name: 'new',
        distro: 'ubuntu',
        cpus: 2,
        memory_mb: 2048,
        disk_gb: 20,
      },
    });
    expect(spy).toHaveBeenCalled();
  });

  it.each([
    ['useStartMachine', useStartMachine, 'machine_start'],
    ['useStopMachine', useStopMachine, 'machine_stop'],
    ['useDeleteMachine', useDeleteMachine, 'machine_delete'],
  ] as const)('%s calls %s', async (_label, hook, cmd) => {
    invokeMock.mockResolvedValue(undefined);
    const client = newClient();
    const { result } = renderHook(() => hook(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('a');
    });
    expect(invokeMock).toHaveBeenCalledWith(cmd, { name: 'a' });
  });
});
