import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect } from 'react';

import {
  machineCreate,
  machineDelete,
  machineEventsSubscribe,
  machineGet,
  machineHealth,
  machineList,
  machineStart,
  machineStop,
} from './api';
import { MachineEventChannel, MachineQueryKey } from './constants';
import {
  type Machine,
  type MachineEvent,
  type MachineHealth,
  type MachineSpec,
  isTransitioning,
} from './types';

const FAST_POLL_MS = 1_000;
const SLOW_POLL_MS = 5_000;

export const useMachineHealth = (
  options?: Omit<
    UseQueryOptions<MachineHealth, Error, MachineHealth, [string]>,
    'queryKey' | 'queryFn'
  >,
) =>
  useQuery({
    queryKey: [MachineQueryKey.HEALTH],
    queryFn: machineHealth,
    ...options,
  });

export const useMachines = () => {
  const queryClient = useQueryClient();

  const query = useQuery<Machine[], Error, Machine[], [string]>({
    queryKey: [MachineQueryKey.LIST],
    queryFn: machineList,
    refetchInterval: (q) => {
      const data = q.state.data as Machine[] | undefined;
      if (!data) return SLOW_POLL_MS;
      return data.some((m) => isTransitioning(m.state))
        ? FAST_POLL_MS
        : SLOW_POLL_MS;
    },
  });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void machineEventsSubscribe().catch(() => undefined);
    void listen<MachineEvent>(MachineEventChannel, (event) => {
      void queryClient.invalidateQueries({
        queryKey: [MachineQueryKey.LIST],
      });
      void queryClient.invalidateQueries({
        queryKey: [MachineQueryKey.GET, event.payload.name],
      });
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [queryClient]);

  return query;
};

export const useMachine = (name: string | undefined) =>
  useQuery<Machine, Error, Machine, [string, string | undefined]>({
    queryKey: [MachineQueryKey.GET, name],
    queryFn: () => {
      if (!name) throw new Error('machine name required');
      return machineGet(name);
    },
    enabled: Boolean(name),
    refetchInterval: (q) => {
      const data = q.state.data as Machine | undefined;
      if (!data) return SLOW_POLL_MS;
      return isTransitioning(data.state) ? FAST_POLL_MS : SLOW_POLL_MS;
    },
  });

const invalidateAll = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: [MachineQueryKey.LIST] });
  void queryClient.invalidateQueries({ queryKey: [MachineQueryKey.GET] });
};

export const useCreateMachine = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spec: MachineSpec) => machineCreate(spec),
    onSuccess: () => invalidateAll(queryClient),
  });
};

export const useStartMachine = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => machineStart(name),
    onSuccess: () => invalidateAll(queryClient),
  });
};

export const useStopMachine = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => machineStop(name),
    onSuccess: () => invalidateAll(queryClient),
  });
};

export const useDeleteMachine = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => machineDelete(name),
    onSuccess: () => invalidateAll(queryClient),
  });
};
