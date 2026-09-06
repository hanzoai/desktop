/**
 * THE brand table. One and only one.
 *
 * Every brand-varying value in the desktop — IdP, chain, cloud API, docs, mark,
 * bundle identifier — is resolved from here via `getBrand()`. There is no second
 * table and no per-surface literal: a hardcoded `hanzo.id` or `<HanzoMark/>` on a
 * surface that a Zoo or Lux build also renders IS the bug this file exists to
 * prevent.
 *
 * Resolution order (see `getBrand`): `VITE_BRAND` (set at build time by
 * `apps/hanzo-desktop/scripts/brand-build.cjs`, which also swaps the Tauri
 * identifier / icons / deep-link scheme) → hostname → hanzo.
 *
 * `iam.clientId` is the desktop OAuth client declaratively provisioned in each
 * brand's IAM as `<brand>-app` — a PUBLIC client (PKCE S256, ships no secret).
 * `iam.redirectUri` must match the brand's `deep-link.desktop.schemes` entry in
 * `tauri.conf.<brand>.json`, and `iam.callbackEvent` the event that
 * `src-tauri/src/deep_links.rs` emits for that scheme's `/oauth/<brand>` path.
 */
export type Brand = 'hanzo' | 'zoo' | 'lux';

export interface BrandConfig {
  brand: Brand;
  name: string;
  productName: string;
  identifier: string;
  logo: { light: string; dark: string; favicon: string };
  colors: { primary: string; bg: string; fg: string };
  hosts: string[];
  storeUrl: { mac: string; win: string; ios: string; android: string };
  // Native chain identity. RPC submits AI-mining proof to the precompile
  // (aiMining at 0x0300...0000 on the brand's primary EVM/A-chain).
  network: {
    rpc: string;            // e.g. https://rpc.zoo.network
    chainId: number;        // e.g. 200200
    token: string;          // gas/native token symbol, e.g. $ZOO
    aiMiningPrecompile: `0x${string}`; // address of the AI-mining EVM precompile
    blockExplorer: string;
  };
  // Decentralized cloud overlay (hanzozt). Each brand has its own edge
  // controller; machines enroll into it to publish/consume zero-trust services.
  overlayController: string;
  // Cloud AI inference endpoint (chat completions / embeddings). Distinct
  // from the chain RPC: this is the user-facing inference gateway, not the
  // chain mining target.
  inferenceEndpoint: string;
  // Cloud control-plane API (fleet + durable jobs). Where a BYO-GPU node
  // registers (/v1/machines, /v1/gpus) and claims work (/v1/tasks gpu-jobs).
  // Brand-scoped: a Hanzo login links the GPU into api.hanzo.ai; Lux → lux.cloud;
  // Zoo → zoo.cloud. This is what `hanzo gpu connect` / hanzod targets.
  cloudApi: string;
  // Documentation site. Every "Docs" affordance in the UI reads this — a Zoo
  // build must never deep-link a reader into Hanzo's docs.
  docs: string;
  // OAuth IAM provider used by "Login with <Brand>" flow.
  iam: {
    baseUrl: string;
    clientId: string;
    redirectUri: string;
    callbackEvent: string;
  };
}

const HANZO: BrandConfig = {
  brand: 'hanzo',
  name: 'Hanzo',
  productName: 'Hanzo Desktop',
  identifier: 'com.hanzo.desktop',
  logo: {
    light: 'libs/hanzo-logo/assets/hanzo/hanzo-logo.svg',
    dark: 'libs/hanzo-logo/assets/hanzo/hanzo-logo.svg',
    favicon: 'libs/hanzo-logo/assets/hanzo/hanzo-icon.svg',
  },
  colors: { primary: '#000000', bg: '#000000', fg: '#ffffff' },
  hosts: ['hanzo.ai', 'web3.hanzo.ai'],
  storeUrl: {
    mac: 'https://github.com/hanzoai/desktop/releases/latest',
    win: 'https://github.com/hanzoai/desktop/releases/latest',
    ios: '',
    android: '',
  },
  network: {
    rpc: 'https://api.web3.hanzo.ai',
    chainId: 36963,
    token: '$AI',
    aiMiningPrecompile: '0x0300000000000000000000000000000000000000',
    blockExplorer: 'https://explorer.hanzo.network',
  },
  overlayController: 'https://edge.web3.hanzo.ai',
  inferenceEndpoint: 'https://api.hanzo.ai',
  cloudApi: 'https://api.hanzo.ai',
  docs: 'https://docs.hanzo.ai',
  iam: {
    baseUrl: 'https://hanzo.id',
    clientId: 'hanzo-app',
    redirectUri: 'hanzo://oauth/hanzo',
    callbackEvent: 'hanzo-iam-callback',
  },
};

const ZOO: BrandConfig = {
  brand: 'zoo',
  name: 'Zoo',
  productName: 'Zoo Desktop',
  identifier: 'com.zoo.desktop',
  logo: {
    light: 'libs/hanzo-logo/assets/zoo/zoo-logo.svg',
    dark: 'libs/hanzo-logo/assets/zoo/zoo-logo.svg',
    favicon: 'libs/hanzo-logo/assets/zoo/zoo-icon.svg',
  },
  colors: { primary: '#000000', bg: '#000000', fg: '#ffffff' },
  hosts: ['zoo.ngo', 'zoo.network', 'zoo.cloud'],
  storeUrl: {
    mac: 'https://github.com/zooai/desktop/releases/latest',
    win: 'https://github.com/zooai/desktop/releases/latest',
    ios: '',
    android: '',
  },
  network: {
    rpc: 'https://rpc.zoo.network',
    chainId: 200200,
    token: '$ZOO',
    aiMiningPrecompile: '0x0300000000000000000000000000000000000000',
    blockExplorer: 'https://explorer.zoo.network',
  },
  overlayController: 'https://edge.zoo.cloud',
  inferenceEndpoint: 'https://api.hanzo.ai',
  cloudApi: 'https://api.zoo.cloud',
  docs: 'https://docs.zoo.ngo',
  iam: {
    baseUrl: 'https://zoolabs.id',
    clientId: 'zoo-app',
    redirectUri: 'zoo://oauth/zoo',
    callbackEvent: 'zoo-iam-callback',
  },
};

const LUX: BrandConfig = {
  brand: 'lux',
  name: 'Lux',
  productName: 'Lux Desktop',
  identifier: 'com.lux.desktop',
  logo: {
    light: 'libs/hanzo-logo/assets/lux/lux-logo.svg',
    dark: 'libs/hanzo-logo/assets/lux/lux-logo.svg',
    favicon: 'libs/hanzo-logo/assets/lux/lux-icon.svg',
  },
  colors: { primary: '#000000', bg: '#000000', fg: '#ffffff' },
  hosts: ['lux.network', 'lux.cloud', 'lux.exchange', 'lux.ai'],
  storeUrl: {
    mac: 'https://github.com/luxfi/desktop/releases/latest',
    win: 'https://github.com/luxfi/desktop/releases/latest',
    ios: '',
    android: '',
  },
  network: {
    rpc: 'https://api.lux.network',
    chainId: 96369,
    token: '$LUX',
    aiMiningPrecompile: '0x0300000000000000000000000000000000000000',
    blockExplorer: 'https://explorer.lux.network',
  },
  overlayController: 'https://edge.lux.cloud',
  inferenceEndpoint: 'https://api.hanzo.ai',
  cloudApi: 'https://api.lux.cloud',
  docs: 'https://docs.lux.network',
  iam: {
    baseUrl: 'https://lux.id',
    clientId: 'lux-app',
    redirectUri: 'lux://oauth/lux',
    callbackEvent: 'lux-iam-callback',
  },
};

const BRANDS: BrandConfig[] = [HANZO, ZOO, LUX];

export function getBrandFromHostname(h: string): BrandConfig {
  const host = h.toLowerCase();
  for (const cfg of BRANDS) {
    if (cfg.hosts.some((d) => host === d || host.endsWith('.' + d))) {
      return cfg;
    }
  }
  return HANZO;
}

/**
 * isMachinesEnabled controls whether the Machines / Containers / K8s /
 * Network pages render. Brands that ship the daemon-backed app stack —
 * Hanzo, Lux, Zoo — expose them by default. Other brands (e.g. liquidity)
 * must opt in via VITE_ENABLE_MACHINES=true.
 */
export function isMachinesEnabled(cfg: BrandConfig = getBrand()): boolean {
  if (cfg.brand === 'hanzo' || cfg.brand === 'lux' || cfg.brand === 'zoo') return true;
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & {
          env?: Record<string, string | undefined>;
        }).env
      : undefined;
  const flag = env ? env['VITE_ENABLE_MACHINES'] : undefined;
  return flag === 'true' || flag === '1';
}

export function getBrand(): BrandConfig {
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & {
          env?: Record<string, string | undefined>;
        }).env
      : undefined;
  const viteBrand = env ? env['VITE_BRAND'] : undefined;
  if (viteBrand === 'hanzo') return HANZO;
  if (viteBrand === 'zoo') return ZOO;
  if (viteBrand === 'lux') return LUX;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return getBrandFromHostname(window.location.hostname);
  }
  return HANZO;
}
