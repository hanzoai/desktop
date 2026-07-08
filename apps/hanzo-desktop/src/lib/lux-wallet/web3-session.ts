/**
 * The identity a user established by signing in with their wallet (IAM web3).
 * Kept separate from node auth (store/auth): this is a chain-identity login,
 * not a hanzo-node connection.
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface Web3Session {
  userId: string;
  address: string;
  chain: string;
  loggedInAt: number;
}

interface Web3SessionState {
  session: Web3Session | null;
  setSession: (s: Web3Session) => void;
  clear: () => void;
}

export const useWeb3Session = create<Web3SessionState>()(
  devtools(
    persist(
      (set) => ({
        session: null,
        setSession: (session) => set({ session }),
        clear: () => set({ session: null }),
      }),
      { name: 'lux-web3-session' },
    ),
  ),
);
