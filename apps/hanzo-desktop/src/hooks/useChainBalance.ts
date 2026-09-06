// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';

import { useNetwork } from '@hanzo/desktop-ui/network';

// Configure the brand's network list before any selection is read.
import '../lib/network';

const POLL_MS = 30_000;

// Returns the on-chain balance for `address` against the SELECTED network's
// RPC (shared @hanzo/ui network store — switching environments repoints it)
// as a decimal string of wei. Polls every 30s. Empty string means unknown.
export function useChainBalance(address: string | null | undefined): {
  balanceWei: string;
  rpcUrl: string;
  loading: boolean;
  error: string | null;
} {
  const { network } = useNetwork();
  const rpc = network.rpcEndpoint;
  const [balanceWei, setBalanceWei] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchBalance = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1,
          }),
        });
        const json = (await res.json()) as { result?: string; error?: { message: string } };
        if (json.error) throw new Error(json.error.message);
        if (!json.result) throw new Error('no result');
        const wei = BigInt(json.result).toString();
        if (!cancelled) setBalanceWei(wei);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchBalance();
    timer = setInterval(fetchBalance, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [address, rpc]);

  return { balanceWei, rpcUrl: rpc, loading, error };
}

// Format a wei decimal string as a human-readable token amount with 4
// fractional digits — suitable for dashboard display.
export function formatWei(wei: string, decimals = 18): string {
  if (!wei) return '0';
  const n = BigInt(wei);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = n % base;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toString()}.${fracStr}`;
}
