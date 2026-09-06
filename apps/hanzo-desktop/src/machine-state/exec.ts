import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import { machineExec } from './api';
import {
  MachineExecChunkChannel,
  MachineExecExitChannel,
} from './constants';
import { type ExecChunk, type ExecExit } from './types';

export interface ExecHandle {
  id: string;
  cancel: () => Promise<void>;
}

export interface RunExecOptions {
  onChunk?: (chunk: ExecChunk) => void;
  onExit?: (exit: number) => void;
}

export const runExec = async (
  name: string,
  cmd: string[],
  options: RunExecOptions = {},
): Promise<ExecHandle> => {
  const id = await machineExec(name, cmd);

  const unlistens: UnlistenFn[] = [];
  const cleanup = () => {
    while (unlistens.length) {
      const fn = unlistens.pop();
      if (fn) fn();
    }
  };

  if (options.onChunk) {
    const handler = options.onChunk;
    unlistens.push(
      await listen<ExecChunk>(MachineExecChunkChannel(id), (event) => {
        handler(event.payload);
      }),
    );
  }

  unlistens.push(
    await listen<ExecExit>(MachineExecExitChannel(id), (event) => {
      if (options.onExit) options.onExit(event.payload.exit);
      cleanup();
    }),
  );

  return {
    id,
    cancel: async () => {
      cleanup();
    },
  };
};

export const runExecToString = async (
  name: string,
  cmd: string[],
): Promise<{ exit: number; stdout: string; stderr: string }> => {
  let stdout = '';
  let stderr = '';
  return new Promise((resolve, reject) => {
    runExec(name, cmd, {
      onChunk: ({ stream, data }) => {
        if (stream === 'stdout') stdout += data;
        else stderr += data;
      },
      onExit: (exit) => resolve({ exit, stdout, stderr }),
    }).catch(reject);
  });
};
