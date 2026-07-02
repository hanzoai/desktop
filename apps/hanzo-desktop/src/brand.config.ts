import type { BrandConfig } from '@hanzo/ai';

// Single source of truth for hanzod's on-device ports (369x band). The node
// field below + the derived `localNode` both read these — change them in ONE
// place. ws/p2p/https/zap = apiPort+1..+4; embed engine = enginePort+1.
const NODE_API_PORT = 3690;
const ENGINE_PORT = 36900;

// This app OWNS its brand. The @hanzo/ai SDK bundles no brands; it receives this
// config via <HanzoAI {...brandConfig}/>. Edit values here — nothing brand-
// specific is hardcoded in the SDK.
export const brandConfig = {
  brand: 'hanzo',
  name: 'Hanzo',
  productName: 'Hanzo Desktop',
  company: 'Hanzo AI',
  identifier: 'com.hanzo.desktop',
  logo: {
    light: '/app-logo.png',
    dark: '/app-logo.png',
    favicon: '/app-logo.png',
  },
  colors: { primary: '#000000', bg: '#000000', fg: '#ffffff' },
  hosts: ['hanzo.ai', 'hanzo.network', 'hanzo.cloud'],
  storeUrl: {
    mac: 'https://github.com/hanzoai/desktop/releases/latest',
    win: 'https://github.com/hanzoai/desktop/releases/latest',
    ios: '',
    android: '',
  },
  network: {
    rpc: 'https://rpc.hanzo.network',
    chainId: 36963,
    token: '$AI',
    aiMiningPrecompile: '0x0300000000000000000000000000000000000000',
    blockExplorer: 'https://explorer.hanzo.network',
  },
  overlayController: 'https://edge.hanzo.cloud',
  inferenceEndpoint: 'https://api.hanzo.ai',
  iam: {
    baseUrl: 'https://hanzo.id',
    clientId: 'hanzo-app-client-id',
    redirectUri: 'hanzo://oauth/hanzo',
    callbackEvent: 'hanzo-iam-callback',
  },
  // hanzod owns the 369x node-port band so Hanzo runs independently of Zoo
  // (200x) and Lux (963x). Single source of truth for this app's node ports.
  node: {
    apiPort: NODE_API_PORT,
    enginePort: ENGINE_PORT,
  },
  machinesEnabled: true,
} as BrandConfig;

// Derived local-node ports/URLs — every localhost node/engine reference in the
// frontend MUST come from here (no hardcoded :3690/:36900).
const _api = NODE_API_PORT;
const _engine = ENGINE_PORT;
export const localNode = {
  apiPort: _api,
  wsPort: _api + 1,
  p2pPort: _api + 2,
  httpsPort: _api + 3,
  zapPort: _api + 4,
  enginePort: _engine,
  embedPort: _engine + 1,
  apiUrl: `http://127.0.0.1:${_api}`,
  wsUrl: `ws://127.0.0.1:${_api + 1}`,
  engineUrl: `http://127.0.0.1:${_engine}`,
  embedUrl: `http://127.0.0.1:${_engine + 1}`,
};

export default brandConfig;
