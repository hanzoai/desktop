/**
 * The desktop's secret store: the OS keychain (macOS Keychain / Windows
 * Credential Manager / libsecret) via the `secure_storage_*` Tauri commands.
 * The Rust side files every entry under the running bundle's identifier, so a
 * Hanzo, Lux and Zoo install on one machine never read each other's secrets.
 *
 * Outside Tauri (`pnpm dev` in a plain browser, the Playwright smoke suite)
 * it falls back to a session-only in-memory map — the same rule the wallet
 * keychain follows (`lib/lux-wallet/keychain.ts`): secrets never hit disk in the
 * clear either way, so nothing here may fall back to localStorage.
 *
 * Shaped as zustand's `StateStorage` so a `persist(...)` store can swap
 * localStorage for it with a one-line change.
 */
import { invoke } from '@tauri-apps/api/core';
import type { StateStorage } from 'zustand/middleware';

import { isTauriAvailable } from '../utils/tauri-check';

const memory = new Map<string, string>();

export const secureStorage: StateStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!isTauriAvailable()) return memory.get(key) ?? null;
    try {
      return await invoke<string>('secure_storage_get', { key });
    } catch {
      // The command rejects with "Key not found" for a missing entry, which is
      // an absent value, not a failure.
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (!isTauriAvailable()) {
      memory.set(key, value);
      return;
    }
    await invoke('secure_storage_set', { key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    if (!isTauriAvailable()) {
      memory.delete(key);
      return;
    }
    await invoke('secure_storage_delete', { key });
  },
};
