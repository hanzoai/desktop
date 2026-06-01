import { invoke } from '@tauri-apps/api/core';

import type {
  Machine,
  MachineHealth,
  MachineSpec,
} from './types';

export const machineHealth = (): Promise<MachineHealth> =>
  invoke<MachineHealth>('machine_health');

export const machineList = (): Promise<Machine[]> =>
  invoke<Machine[]>('machine_list');

export const machineGet = (name: string): Promise<Machine> =>
  invoke<Machine>('machine_get', { name });

export const machineCreate = (spec: MachineSpec): Promise<Machine> =>
  invoke<Machine>('machine_create', { spec });

export const machineStart = (name: string): Promise<void> =>
  invoke<void>('machine_start', { name });

export const machineStop = (name: string): Promise<void> =>
  invoke<void>('machine_stop', { name });

export const machineDelete = (name: string): Promise<void> =>
  invoke<void>('machine_delete', { name });

export const machineExec = (name: string, cmd: string[]): Promise<string> =>
  invoke<string>('machine_exec', { name, cmd });

export const machineEventsSubscribe = (): Promise<void> =>
  invoke<void>('machine_events_subscribe');
