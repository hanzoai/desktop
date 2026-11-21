import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { debug } from '@tauri-apps/plugin-log';
import { useEffect } from 'react';

import { useAuth } from './auth';
import { useExperimental } from './experimental';
import { useSettings } from './settings';
import { useHanzoNodeManager } from './hanzo-node-manager';

export type RehydrateStorageEvent = {
  triggeredBy: string;
  stores: string[];
};

const stores = new Map(
  [useAuth, useSettings, useHanzoNodeManager, useExperimental].map((s) => [
    s.persist.getOptions().name,
    s,
  ]),
);

const rehydrateStore = (targetStores: string[]) => {
  targetStores.forEach((storeName) =>
    stores.get(storeName)?.persist.rehydrate(),
  );
};

export const useSyncStorageSecondary = () => {
  useEffect(() => {
    const currentWindowLabel = getCurrentWindow().label;

    void debug('using sync storage secondary');

    const handleRehydrate = (triggeredBy: string, targetStores: string[]) => {
      void debug(
        `${currentWindowLabel} rehydrating stores:${targetStores?.join(',')} triggeredBy:${triggeredBy}`,
      );
      rehydrateStore(targetStores);
    };

    const unlistenRehydrateStorage = listen<RehydrateStorageEvent>(
      'rehydrate-storage',
      (event) =>
        handleRehydrate(event.payload.triggeredBy, event.payload.stores),
    );

    return () => {
      unlistenRehydrateStorage.then((fn) => fn()).catch(() => {
        // Ignore cleanup errors - this can happen if the process ends quickly
      });
    };
  }, []);
};
