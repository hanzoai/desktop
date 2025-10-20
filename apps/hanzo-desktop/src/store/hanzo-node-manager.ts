import { debug } from '@tauri-apps/plugin-log';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { type HanzoNodeOptions } from '../lib/hanzo-node-manager/hanzo-node-manager-client-types';

type HanzoNodeManagerStore = {
  isInUse: boolean | null;
  setIsInUse: (value: boolean) => void;
  hanzoNodeOptions: Partial<HanzoNodeOptions> | null;
  setHanzoNodeOptions: (
    hanzoNodeOptions: Partial<HanzoNodeOptions> | null,
  ) => void;
};

export const useHanzoNodeManager = create<HanzoNodeManagerStore>()(
  devtools(
    persist(
      (set) => ({
        isInUse: false,
        hanzoNodeOptions: null,
        setHanzoNodeOptions: (hanzoNodeOptions) => {
          void debug('setting hanzo-node options');
          set({ hanzoNodeOptions });
        },
        setIsInUse: (value: boolean) => {
          void debug('setting is in use');
          set({ isInUse: value });
        },
      }),
      {
        name: 'hanzo-node-options',
      },
    ),
  ),
);
