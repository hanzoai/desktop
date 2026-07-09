// SPDX-License-Identifier: Apache-2.0
import { getBrand } from '@hanzo_network/brand-config';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatWei, useChainBalance } from '../hooks/useChainBalance';
import { useSelectedAccount } from '../lib/lux-wallet';
import { isTauriAvailable, safeInvoke, safeListen } from '../utils/tauri-check';

type Privacy = 'public' | 'private' | 'confidential' | 'sovereign';

interface ProofRecord {
  work_id_hex: string;
  reward_wei: string;
  chain_id: number;
  status: string;
  timestamp: number;
  privacy: number;
  compute_minutes: number;
  backend: string;
}

interface MiningProgress {
  work_id_hex: string;
  reward_wei: string;
  chain_id: number;
  status: string;
}

const PRIVACY_LABELS: Record<Privacy, { label: string; multiplier: string }> = {
  public: { label: 'Public', multiplier: '0.25x' },
  private: { label: 'Private', multiplier: '0.50x' },
  confidential: { label: 'Confidential', multiplier: '1.00x' },
  sovereign: { label: 'Sovereign', multiplier: '1.50x' },
};

// Hashrate window: count proofs in the last 5 minutes -> proofs/min.
const HASHRATE_WINDOW_MS = 5 * 60 * 1000;

export default function MiningPage() {
  const brand = getBrand();
  const token = brand.network.token;
  const account = useSelectedAccount();

  const [history, setHistory] = useState<ProofRecord[]>([]);
  const [pendingWei, setPendingWei] = useState<string>('0');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [backend, setBackend] = useState<string>('CPU');
  const recentTickRef = useRef<number[]>([]);
  const [hashrateProofsPer5Min, setHashrateProofsPer5Min] = useState<number>(0);

  const { balanceWei: chainBalanceWei, loading: chainLoading } = useChainBalance(
    account?.evmAddress ?? null,
  );

  const refresh = useCallback(async () => {
    if (!isTauriAvailable()) return;
    const [hist, pending, state] = await Promise.all([
      safeInvoke<ProofRecord[]>('mining_get_history'),
      safeInvoke<string>('mining_get_local_pending'),
      safeInvoke<{ backend?: string; privacy?: Privacy }>('mining_get_state'),
    ]);
    if (hist) setHistory(hist);
    if (pending) setPendingWei(pending);
    if (state) {
      if (state.backend) setBackend(state.backend);
      if (state.privacy) setPrivacy(state.privacy);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void safeListen<MiningProgress>('mining://progress', () => {
      const now = Date.now();
      recentTickRef.current = [
        ...recentTickRef.current.filter((t) => now - t < HASHRATE_WINDOW_MS),
        now,
      ];
      setHashrateProofsPer5Min(recentTickRef.current.length);
      void refresh();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  const handlePrivacyChange = async (p: Privacy) => {
    setPrivacy(p);
    if (isTauriAvailable()) {
      await safeInvoke('mining_set_privacy', { privacy: p });
    }
  };

  const recent = useMemo(() => history.slice(-10).reverse(), [history]);
  const explorerUrl = account?.evmAddress
    ? `${brand.network.blockExplorer}/address/${account.evmAddress}`
    : brand.network.blockExplorer;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="mining-page">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{token} Mining</h1>
        <span className="text-text-secondary text-xs">backend: {backend}</span>
      </header>

      <div
        className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
        data-testid="phase1-banner"
      >
        Phase 1: proofs are verified locally against the lux AI-mining
        precompile. The on-chain claim flow ships in a future update.
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="border-divider rounded border p-4">
          <div className="text-text-secondary text-xs uppercase">On-chain</div>
          <div className="mt-2 text-2xl font-semibold" data-testid="onchain-balance">
            {chainLoading && !chainBalanceWei
              ? '…'
              : `${formatWei(chainBalanceWei || '0')} ${token}`}
          </div>
          <a
            className="text-text-secondary mt-2 inline-block text-xs underline"
            href={explorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            view on explorer
          </a>
        </div>
        <div className="border-divider rounded border p-4">
          <div className="text-text-secondary text-xs uppercase">
            Local pending (ready to claim)
          </div>
          <div className="mt-2 text-2xl font-semibold" data-testid="pending-balance">
            {formatWei(pendingWei)} {token}
          </div>
          <div className="text-text-secondary mt-2 text-xs">
            {hashrateProofsPer5Min} proofs / 5 min
          </div>
        </div>
      </section>

      <section>
        <div className="text-text-secondary mb-2 text-xs uppercase">
          Privacy tier
        </div>
        <div className="flex flex-wrap gap-2" data-testid="privacy-selector">
          {(Object.keys(PRIVACY_LABELS) as Privacy[]).map((p) => {
            const meta = PRIVACY_LABELS[p];
            const active = privacy === p;
            return (
              <button
                className={
                  'rounded border px-3 py-1.5 text-sm ' +
                  (active
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-divider')
                }
                data-testid={`privacy-${p}`}
                key={p}
                onClick={() => void handlePrivacyChange(p)}
                type="button"
              >
                {meta.label} <span className="text-text-secondary">{meta.multiplier}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="text-text-secondary mb-2 text-xs uppercase">
          Recent proofs
        </div>
        <table className="w-full text-sm" data-testid="recent-proofs">
          <thead>
            <tr className="text-text-secondary text-left">
              <th className="py-1">work id</th>
              <th>reward</th>
              <th>status</th>
              <th>ts</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td className="text-text-secondary py-2" colSpan={4}>
                  No proofs yet.
                </td>
              </tr>
            ) : (
              recent.map((r) => (
                <tr className="border-divider border-t" key={r.work_id_hex}>
                  <td className="py-1 font-mono text-xs">
                    {r.work_id_hex.slice(0, 8)}…{r.work_id_hex.slice(-6)}
                  </td>
                  <td>
                    {formatWei(r.reward_wei)} {token}
                  </td>
                  <td>
                    {r.status === 'locally_verified'
                      ? 'Locally verified'
                      : 'Pending claim'}
                  </td>
                  <td className="text-text-secondary text-xs">
                    {new Date(r.timestamp * 1000).toLocaleTimeString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
