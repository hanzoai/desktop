/**
 * Chain metadata + RPC wiring for the wallet, sourced from @luxwallet/chains
 * (the one registry) and the desktop brand config.
 *
 * EVM chains with a `ready` tx builder are fully operational (create / list /
 * balance / send). Non-EVM families (Lux X/P/Q/Z chains) are registry-only
 * stubs upstream — surfaced honestly as "coming soon", never faked.
 */
import { getBrand } from '@hanzo_network/brand-config';
import { getNetwork } from '@hanzo/ui/network';

// Configure the brand's network list before any selection is read.
import '../network';
import { allChains, getChain, type ChainEntry } from '@luxwallet/chains';
import { RpcClient, type RpcConfig } from '@luxwallet/rpc';

/** Every EVM chain whose unsigned-tx builder is `ready` (fully working). */
export function evmChains(): ChainEntry[] {
  return allChains().filter(
    (c) => c.family === 'evm' && c.builderStatus === 'ready',
  );
}

/** Non-EVM / not-yet-ready chains — shown as "coming soon", not operational. */
export function comingSoonChains(): ChainEntry[] {
  return allChains().filter(
    (c) => c.family !== 'evm' || c.builderStatus !== 'ready',
  );
}

export function chainById(id: string | number): ChainEntry | undefined {
  return getChain(id);
}

/**
 * The wallet's default chain: the brand's own primary EVM chain if it is in
 * the registry (Lux C-Chain, Hanzo, Zoo), else the first ready EVM chain.
 */
export function defaultChainId(): number {
  // The selected hanzo.network environment wins when the registry knows it.
  const selected = getNetwork().evmChainID;
  if (evmChains().some((c) => c.evmChainId === selected)) return selected;
  const brandChainId = getBrand().network.chainId;
  const match = evmChains().find((c) => c.evmChainId === brandChainId);
  if (match?.evmChainId) return match.evmChainId;
  const first = evmChains()[0];
  return first?.evmChainId ?? brandChainId;
}

/**
 * Build the RPC config from the active brand. All chains route through the
 * brand gateway (`https://<cloudApi-host>/v1/rpc/<route>`); the brand's own
 * chain also gets a direct-RPC override from brand-config so balances work
 * even if the gateway route is not yet provisioned.
 */
export function brandRpcConfig(): RpcConfig {
  const brand = getBrand();
  const net = getNetwork();
  const gateway = net.apiEndpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const overrides: Record<number, string> = {};
  if (brand.network.chainId && brand.network.rpc) {
    overrides[brand.network.chainId] = brand.network.rpc;
  }
  // The selected environment always wins for its own chain.
  overrides[net.evmChainID] = net.rpcEndpoint;
  return { gateway, overrides };
}

/** A JSON-RPC client bound to `chainId` via the brand gateway. */
export function rpcClient(chainId: number): RpcClient {
  return new RpcClient(chainId, brandRpcConfig());
}

export type { ChainEntry };
