/**
 * The desktop's Lux Wallet store — a THIN brand/network wiring over the shared
 * headless engine @luxwallet/store. The engine (create / import / reveal /
 * balance / send, secp256k1 + ML-DSA-65, node-independent) lives once in
 * @luxwallet/store; this file only injects the desktop's seams:
 *
 *   - crypto   → local @luxfi/crypto WASM loader (Vite ?url asset)
 *   - keychain → OS keychain via the Tauri `secure_storage_*` commands
 *   - chains   → the brand's chain + gateway wiring (./chains)
 *
 * All three desktops share the same engine; only these seams differ.
 */
import { createLuxWallet } from '@luxwallet/store';

import { chainById, defaultChainId, rpcClient } from './chains';
import { getLuxCrypto } from './crypto';
import { keychain } from './keychain';

export const useLuxWallet = createLuxWallet({
  crypto: getLuxCrypto,
  keychain,
  chains: { chainById, defaultChainId, rpcClient },
  persistName: 'lux-wallet',
});

/**
 * The active account (selected, else the first) — the ONE way any surface
 * (crypto-wallet page, WalletMenu, mining) reads "the current wallet". Returns
 * null when no account has been provisioned yet.
 */
export const useSelectedAccount = () =>
  useLuxWallet(
    (s) => s.accounts.find((a) => a.id === s.selectedAccountId) ?? s.accounts[0] ?? null,
  );

export type {
  WalletType,
  LuxAccount,
  Balance,
  SendParams,
  Status,
  LuxWalletState,
} from '@luxwallet/store';
