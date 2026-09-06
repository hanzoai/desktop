import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { secureStorage } from '../lib/secure-storage';

export type Auth = {
  profile: string;
  node_address: string;
  hanzo_identity: string;
  encryption_pk: string;
  identity_pk: string;
  api_v2_key: string;
  hanzo_token?: string;
  hanzo_refresh_token?: string;
};

type AuthStore = {
  auth: Auth | null;
  setAuth: (auth: Auth) => void;
  setLogout: () => void;
};

export const useAuth = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        auth: null,
        setAuth: (auth: Auth) => set({ auth }),
        setLogout: () => {
          set({ auth: null });
        },
      }),
      {
        name: 'auth',
        // This record holds the node API key and the IAM bearer/refresh tokens.
        // It used to persist to localStorage — plaintext on disk, readable by
        // anything running in the webview. It now goes to the OS keychain via
        // the `secure_storage_*` commands, scoped to the running bundle's
        // identifier so brands never share an entry. `persist` accepts an async
        // storage and rehydrates when the read resolves.
        storage: createJSONStorage(() => secureStorage),
      },
    ),
  ),
);
