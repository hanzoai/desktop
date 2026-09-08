/**
 * Wallet domain — the ONE wallet indicator (<WalletMenu/>) + adapter
 * contract for the desktop. Vendored into the app's shared UI lib (was
 * `@hanzo/ui/wallet`). Custody stays in the injected adapter; this exposes
 * only what the app consumes.
 */
export { WalletMenu } from './WalletMenu';
export type { WalletAdapter, WalletState } from './types';
