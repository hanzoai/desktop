export type Brand = 'hanzo' | 'zoo';

export interface BrandConfig {
  brand: Brand;
  name: string;
  productName: string;
  identifier: string;
  logo: { light: string; dark: string; favicon: string };
  colors: { primary: string; bg: string; fg: string };
  hosts: string[];
  storeUrl: { mac: string; win: string; ios: string; android: string };
  network: { rpc: string; chainId: number; token: string };
  miningEndpoint: string;
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
  colors: {
    primary: '#000000',
    bg: '#000000',
    fg: '#ffffff',
  },
  hosts: ['hanzo.ai'],
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
  },
  miningEndpoint: 'https://gateway.hanzo.ai',
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
  colors: {
    primary: '#000000',
    bg: '#000000',
    fg: '#ffffff',
  },
  hosts: ['zoo.ngo', 'zoo.network'],
  storeUrl: {
    mac: 'https://github.com/zooai/desktop/releases/latest',
    win: 'https://github.com/zooai/desktop/releases/latest',
    ios: '',
    android: '',
  },
  network: {
    rpc: 'https://rpc.hanzo.network',
    chainId: 36900,
    token: '$AI',
  },
  miningEndpoint: 'https://gateway.hanzo.ai',
};

export function getBrandFromHostname(h: string): BrandConfig {
  const host = h.toLowerCase();
  for (const cfg of [ZOO, HANZO]) {
    if (cfg.hosts.some((d) => host === d || host.endsWith('.' + d))) {
      return cfg;
    }
  }
  return HANZO;
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
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return getBrandFromHostname(window.location.hostname);
  }
  return HANZO;
}
