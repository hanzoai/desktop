// Hanzo brand tokens — the single source of truth for brand/network identity.
// Sibling apps (Zoo, Lux) ship the SAME shape with their own values, so the UI
// never hardcodes a brand string. Network values mirror the hanzo-mining crate's
// NetworkType so the desktop and the Rust mining core agree on chain/token.
export interface Brand {
  /** Short brand name, e.g. shown in headers/logo. */
  name: string;
  /** Product/display name, e.g. window + about. */
  productName: string;
  /** Legal/company name. */
  company: string;
  /** Primary domain (drives reverse-DNS appId). */
  domain: string;
  /** macOS/Tauri bundle identifier (reverse-DNS of domain). */
  appId: string;
  /** Deep-link scheme. */
  scheme: string;
  /** hanzo-mining NetworkType variant this app mines on. */
  network: string;
  /** Native AI-chain token symbol. */
  nativeToken: string;
  /** EVM chain id. */
  chainId: number;
  /** JSON-RPC endpoint. */
  rpcUrl: string;
  /** Block explorer base URL. */
  explorerUrl: string;
}

export const BRAND: Brand = {
  name: 'Hanzo',
  productName: 'Hanzo',
  company: 'Hanzo AI',
  domain: 'hanzo.ai',
  appId: 'ai.hanzo.desktop',
  scheme: 'hanzo',
  network: 'HanzoMainnet',
  nativeToken: 'HAI',
  chainId: 36963,
  rpcUrl: 'https://rpc.hanzo.network',
  explorerUrl: 'https://explorer.hanzo.network',
};

export default BRAND;
