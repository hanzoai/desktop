/**
 * Selected-network bootstrap for the desktop — the ONE place the brand's
 * network list is composed and handed to the shared @hanzo/ui network
 * store. Hanzo runs the canonical hanzo.network environments (identical
 * to the `hanzo` CLI + console); other brands get their brand-config
 * mainnet. Everything that talks to a chain or the cloud reads the
 * selection back through `getNetwork()` / `useNetwork()`.
 */
import { getBrand, type BrandConfig } from '@hanzo_network/brand-config';
import {
  configureNetworks,
  HANZO_NETWORKS,
  type Network,
} from '@hanzo_network/hanzo-ui/network';

/** The network environments this brand can point at. */
export function brandNetworks(
  brand: BrandConfig = getBrand(),
): readonly Network[] {
  if (brand.brand === 'hanzo') return HANZO_NETWORKS;
  return [
    {
      env: 'mainnet',
      label: `${brand.name} Mainnet`,
      networkID: brand.network.chainId,
      evmChainID: brand.network.chainId,
      rpcEndpoint: brand.network.rpc,
      apiEndpoint: brand.cloudApi,
      explorerEndpoint: brand.network.blockExplorer,
      currency: brand.network.token.replace(/^\$/, ''),
    },
  ];
}

configureNetworks(brandNetworks());
