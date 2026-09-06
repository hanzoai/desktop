import { invoke } from '@tauri-apps/api/core';
import type { Event, EventCallback, UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';

export const isTauriAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
};

export const safeInvoke = async <T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> => {
  if (!isTauriAvailable()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.warn(`[tauri] invoke "${cmd}" failed:`, error);
    return null;
  }
};

export const safeListen = async <T>(
  event: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn | null> => {
  if (!isTauriAvailable()) return null;
  try {
    return await listen<T>(event, handler as EventCallback<T>);
  } catch (error) {
    console.warn(`[tauri] listen "${event}" failed:`, error);
    return null;
  }
};
