/**
 * WalletAdapter over the lux-wallet store — plugs the desktop's
 * keychain-held PQ HD wallet into the shared <WalletMenu/>.
 *
 * connect() auto-provisions: if no account exists yet, one is created
 * (secp256k1 + ML-DSA-65 identity). Secrets never pass through here —
 * the store seals the mnemonic/private key in the OS keychain; backup
 * and reveal stay on the crypto-wallet page.
 */
import type { Network } from '@hanzo/desktop-ui/network';
import type { WalletAdapter, WalletState } from '@hanzo/desktop-ui/wallet';

import { chainById } from './chains';
import { useLuxWallet } from './store';

function snapshot(): WalletState {
  const s = useLuxWallet.getState();
  const account =
    s.accounts.find((a) => a.id === s.selectedAccountId) ?? s.accounts[0] ?? null;
  return {
    status:
      s.status === 'error'
        ? 'error'
        : s.status === 'loading'
          ? 'connecting'
          : account
            ? 'ready'
            : 'disconnected',
    account: account
      ? {
          address: account.evmAddress,
          label: account.label,
          pqPublicKey: account.pqPublicKey || undefined,
          pqNodeId: account.pqNodeId || undefined,
        }
      : null,
    chainId: s.selectedChainId,
    error: s.error,
  };
}

let state: WalletState = snapshot();
let wired = false

function wire(): void {
  if (wired) return;
  wired = true;
  useLuxWallet.subscribe(() => {
    state = snapshot();
  });
}

/** The desktop's ONE wallet adapter (module singleton — one custody view). */
export const luxWalletAdapter: WalletAdapter = {
  getState() {
    wire();
    return state;
  },
  subscribe(cb) {
    wire();
    return useLuxWallet.subscribe(() => cb());
  },
  async connect() {
    wire();
    await useLuxWallet.getState().init();
    const s = useLuxWallet.getState();
    if (s.status === 'error') throw new Error(s.error ?? 'wallet engine failed to start');
    if (s.accounts.length === 0) {
      // Auto-provision. The mnemonic is sealed in the keychain by the
      // store; backup/reveal happens on the crypto-wallet page.
      await s.createWallet();
    }
  },
  async ensureNetwork(network: Network) {
    if (!chainById(network.evmChainID)) {
      throw new Error(`chain ${network.evmChainID} is not in the wallet registry`);
    }
    useLuxWallet.getState().selectChain(network.evmChainID);
  },
};
