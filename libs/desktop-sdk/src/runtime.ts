import { invoke } from '@tauri-apps/api/core';
import type { Event, EventCallback, UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';

/**
 * Returns true when running inside a Tauri v2 desktop webview.
 * Safe to call during SSR or inside a standard browser tab.
 */
export const isTauriAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
};

/**
 * Invokes a Tauri command when inside a Tauri webview, returning null in
 * plain browsers or if the command fails.
 */
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

/**
 * Subscribes to a Tauri event when inside a Tauri webview, returning null in
 * plain browsers or if subscription fails.
 */
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

/**
 * Detects macOS user agents so overlay titlebars can reserve traffic-light space.
 */
export const isMacOS = (userAgent?: string): boolean => {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /Mac/.test(ua);
};

/**
 * Returns the left horizontal inset (in pixels) needed to clear macOS window
 * traffic-light controls when using Tauri `titleBarStyle: "Overlay"`.
 */
export const getTitlebarInset = (userAgent?: string): number =>
  isMacOS(userAgent) ? 78 : 0;
