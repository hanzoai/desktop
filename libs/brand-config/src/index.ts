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
  hosts: ['hanzo.ai', 'hanzo.network'],
  storeUrl: {
    mac: 'https://github.com/hanzoai/desktop/releases/latest',
    win: 'https://github.com/hanzoai/desktop/releases/latest',
    ios: '',
    android: '',
  },
  network: {
    rpc: 'https://rpc.hanzo.network',
    chainId: 36900,
    token: '$AI',
    aiMiningPrecompile: '0x0300000000000000000000000000000000000000',
    blockExplorer: 'https://explorer.hanzo.network',
  },
  overlayController: 'https://edge.hanzo.network',
  inferenceEndpoint: 'https://gateway.hanzo.ai',
  iam: {
    baseUrl: 'https://hanzo.id',
    clientId: 'hanzo-app-client-id',
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
  inferenceEndpoint: 'https://gateway.hanzo.ai',
  iam: {
    baseUrl: 'https://zoolabs.id',
    clientId: 'zoo-app-client-id',
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
  inferenceEndpoint: 'https://gateway.hanzo.ai',
  iam: {
    baseUrl: 'https://lux.id',
    clientId: 'lux-app-client-id',
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
