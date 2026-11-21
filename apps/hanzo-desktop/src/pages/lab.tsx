// zen lab — heterogeneous federation status.
// Fetches /v1/metrics from the lab coordinator (default spark.local:8443).
// Lives at /lab in the desktop. The coordinator URL can be overridden via
// the ZEN_LAB_COORDINATOR localStorage key.

import { useEffect, useState } from 'react';

type Worker = {
  name: string;
  host: string;
  backend: 'mlx' | 'cuda' | 'rocm' | 'mps' | 'cpu';
  memory_gb: number;
  pin_experts: string[];
};

type Round = {
  round_id: number;
  expected: string[];
  received: string[];
  losses: Record<string, number>;
  aggregated: boolean;
  duration_s: number | null;
};

type Metrics = {
  topology: {
    workers: Worker[];
    data_weights: Record<string, number>;
    expert_pins: Record<string, string[]>;
    aggregation: string;
    sync_interval_steps: number;
  };
  rounds: Round[];
  current_round: number;
};

const DEFAULT_COORDINATOR = 'http://spark.local:8443';

const BACKEND_COLORS: Record<string, string> = {
  cuda: 'bg-green-900/40 text-green-300',
  rocm: 'bg-red-900/40 text-red-300',
  mlx:  'bg-blue-900/40 text-blue-300',
  mps:  'bg-zinc-800 text-zinc-400',
  cpu:  'bg-zinc-900 text-zinc-500',
};

export default function LabPage() {
  const [coord] = useState(() =>
    localStorage.getItem('ZEN_LAB_COORDINATOR') || DEFAULT_COORDINATOR
  );
  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`${coord}/v1/metrics`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) { setData(j); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coord]);

  if (err && !data) {
    return (
      <div className="p-6 text-sm">
        <h1 className="text-lg font-medium mb-2">zen lab</h1>
        <p className="text-red-400">coordinator unreachable: {err}</p>
        <p className="text-zinc-500 mt-2">
          Expected at <code>{coord}</code>. Override via:
          <code className="ml-2 px-1 bg-zinc-800 rounded">
            localStorage.setItem('ZEN_LAB_COORDINATOR', 'http://your-host:8443')
          </code>
        </p>
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-zinc-500">loading...</div>;

  const t = data.topology;
  const recent = data.rounds.slice(-15).reverse();

  return (
    <div className="p-6 font-mono text-sm">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-medium">zen lab</h1>
        <span className="text-zinc-500">
          current round {data.current_round} • {t.aggregation} • sync/{t.sync_interval_steps}
        </span>
      </div>

      <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">workers</h2>
      <table className="w-full mb-6">
        <thead className="text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="text-left py-1">name</th>
            <th className="text-left py-1">host</th>
            <th className="text-left py-1">backend</th>
            <th className="text-right py-1">mem</th>
            <th className="text-right py-1">data %</th>
            <th className="text-left py-1 pl-4">experts pinned</th>
          </tr>
        </thead>
        <tbody>
          {t.workers.map(w => {
            const pct = (t.data_weights[w.name] || 0) * 100;
            const pins = t.expert_pins[w.name] || [];
            return (
              <tr key={w.name} className="border-t border-zinc-900">
                <td className="py-1">{w.name}</td>
                <td className="py-1 text-zinc-500">{w.host}</td>
                <td className="py-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${BACKEND_COLORS[w.backend]}`}>
                    {w.backend}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{w.memory_gb} GB</td>
                <td className="py-1 text-right tabular-nums">{pct.toFixed(1)}%</td>
                <td className="py-1 pl-4 text-zinc-400">
                  {pins.length ? pins.join(', ') : <span className="text-zinc-600">auto</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">recent rounds</h2>
      <table className="w-full">
        <thead className="text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="text-right py-1">round</th>
            <th className="text-left py-1 pl-4">workers received</th>
            <th className="text-right py-1">mean loss</th>
            <th className="text-right py-1">duration</th>
            <th className="text-left py-1 pl-4">status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map(r => {
            const ls = Object.values(r.losses);
            const mean = ls.length ? (ls.reduce((a,b) => a+b, 0) / ls.length).toFixed(4) : '—';
            const dur  = r.duration_s ? `${r.duration_s.toFixed(1)}s` : '—';
            return (
              <tr key={r.round_id} className="border-t border-zinc-900">
                <td className="py-1 text-right tabular-nums">{r.round_id}</td>
                <td className="py-1 pl-4 text-zinc-400">{r.received.join(', ')}</td>
                <td className="py-1 text-right tabular-nums">{mean}</td>
                <td className="py-1 text-right tabular-nums">{dur}</td>
                <td className="py-1 pl-4">
                  {r.aggregated
                    ? <span className="text-green-400">aggregated</span>
                    : <span className="text-yellow-400">{r.received.length}/{r.expected.length}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
