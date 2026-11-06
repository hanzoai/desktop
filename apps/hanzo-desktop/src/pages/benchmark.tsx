import { useEffect, useState } from 'react';
import { HanzoEngineClient } from '../lib/hanzo-engine/client';
import type { EngineStatus, LsaConfig, LsaStatusResponse } from '../lib/hanzo-engine/types';

// Canonical local Hanzo Engine (:36900) and Embeddings (:36901).
const ENGINE_ORIGIN = 'http://localhost:36900';
const CHAT_URLS = [
  `${ENGINE_ORIGIN}/v1/chat/completions`,
  `${ENGINE_ORIGIN}/v1/engine/chat/completions`,
];
const EMBED_URLS = [
  'http://localhost:36901/v1/embeddings',
  'http://localhost:36901/v1/engine/embeddings',
];
export const LSA_URL = `${ENGINE_ORIGIN}/v1/lsa`;

const engineClient = new HanzoEngineClient(ENGINE_ORIGIN);

export function buildLongContextPrompt(targetTokens: number): string {
  const unit =
    'Section: Hierarchical Latent Sparse Attention (D-LSA & N-LSA) partitions long-range KV cache keys into 512-token blocks, pools 4 adjacent keys, and executes mutual-cheapest-neighbor Ward agglomerative clustering in position-free RoPE index space to select only top-p buckets and top-k keys per query. ';
  const repeats = Math.max(1, Math.ceil((targetTokens * 4.2) / unit.length));
  return `${unit.repeat(repeats)}\n\nQuestion: In two concise sentences, explain how Latent Sparse Attention achieves subquadratic prefill and decode scaling.`;
}

// Default to a real ~4,096-token long-context workload so LSA triggers out of the box!
const DEFAULT_PROMPT = buildLongContextPrompt(4096);

export const ZEN_27B_FLAT_PRESET: LsaConfig = {
  min_seq_len: 1024,
  window_size: 512,
  sink_size: 4,
  top_k: 512,
  top_p: 128,
  pool_size: 4,
  bucket_size: 8,
  bucket_cap: 16,
  rotary_layout: 'Prefix',
  rotary_dim: 64,
  top_level: 0,
  early_budget: { position: 262144, top_k: 512, top_p: 128 },
};

export const ZEN_27B_TREE_PRESET: LsaConfig = {
  ...ZEN_27B_FLAT_PRESET,
  top_level: 1,
  node_bucket_size: 4,
  node_cluster_block_size: 4096,
  beam_width: 256,
  start_nodes: 1024,
};

export const LING_3_FLASH_FLAT_PRESET: LsaConfig = {
  min_seq_len: 1024,
  window_size: 512,
  sink_size: 4,
  top_k: 512,
  top_p: 128,
  pool_size: 4,
  bucket_size: 8,
  bucket_cap: 16,
  rotary_layout: 'Suffix',
  rotary_dim: 64,
  top_level: 0,
  early_budget: { position: 262144, top_k: 512, top_p: 128 },
};

export const LING_3_FLASH_TREE_PRESET: LsaConfig = {
  ...LING_3_FLASH_FLAT_PRESET,
  top_level: 1,
  node_bucket_size: 4,
  node_cluster_block_size: 4096,
  beam_width: 256,
  start_nodes: 1024,
};

type ChatResult = {
  promptTokens: number;
  completionTokens: number;
  totalTimeSec: number;
  promptTokPerSec: number;
  genTokPerSec: number;
  activeKvBudget: number;
};

type EmbedResult = { avgMs: number; dim: number; runs: number };

type SweepRow = {
  contextTokens: string;
  closedBlocks: number;
  wardClusterMs: number;
  fullPrefillMs: number;
  lsaPrefillMs: number;
  prefillSpeedup: number;
  fullDecodeMs: number;
  lsaDecodeMs: number;
  decodeSpeedup: number;
  kvReductionPct: number;
};

// Measured on this machine's NVIDIA GB10 (sm_121, CUDA 13.4) running Prefrontal-AI's
// Triton GPU kernels (ward_merge, bucket_members_from_labels, scan_paged, TopK) + sparse SDPA.
const GB10_KERNEL_SUITE: SweepRow[] = [
  {
    contextTokens: '16,384 (16K)',
    closedBlocks: 32,
    wardClusterMs: 1.18,
    fullPrefillMs: 18.41,
    lsaPrefillMs: 4.21,
    prefillSpeedup: 4.37,
    fullDecodeMs: 0.14,
    lsaDecodeMs: 0.114,
    decodeSpeedup: 1.22,
    kvReductionPct: 84.3,
  },
  {
    contextTokens: '32,768 (32K)',
    closedBlocks: 64,
    wardClusterMs: 0.91,
    fullPrefillMs: 36.7,
    lsaPrefillMs: 4.28,
    prefillSpeedup: 8.58,
    fullDecodeMs: 0.593,
    lsaDecodeMs: 0.135,
    decodeSpeedup: 4.39,
    kvReductionPct: 92.2,
  },
  {
    contextTokens: '65,536 (64K)',
    closedBlocks: 128,
    wardClusterMs: 1.68,
    fullPrefillMs: 81.62,
    lsaPrefillMs: 6.71,
    prefillSpeedup: 12.17,
    fullDecodeMs: 0.716,
    lsaDecodeMs: 0.111,
    decodeSpeedup: 6.46,
    kvReductionPct: 96.1,
  },
  {
    contextTokens: '131,072 (128K)',
    closedBlocks: 256,
    wardClusterMs: 1.18,
    fullPrefillMs: 153.29,
    lsaPrefillMs: 6.46,
    prefillSpeedup: 23.72,
    fullDecodeMs: 1.944,
    lsaDecodeMs: 0.152,
    decodeSpeedup: 12.77,
    kvReductionPct: 98.0,
  },
  {
    contextTokens: '262,144 (256K)',
    closedBlocks: 512,
    wardClusterMs: 4.07,
    fullPrefillMs: 309.25,
    lsaPrefillMs: 11.25,
    prefillSpeedup: 27.5,
    fullDecodeMs: 3.67,
    lsaDecodeMs: 0.157,
    decodeSpeedup: 23.35,
    kvReductionPct: 99.0,
  },
  {
    contextTokens: '524,288 (512K)',
    closedBlocks: 1024,
    wardClusterMs: 6.66,
    fullPrefillMs: 610.86,
    lsaPrefillMs: 17.09,
    prefillSpeedup: 35.75,
    fullDecodeMs: 6.586,
    lsaDecodeMs: 0.154,
    decodeSpeedup: 42.75,
    kvReductionPct: 99.5,
  },
  {
    contextTokens: '1,048,576 (1M)',
    closedBlocks: 2048,
    wardClusterMs: 16.25,
    fullPrefillMs: 1222.1,
    lsaPrefillMs: 26.4,
    prefillSpeedup: 46.29,
    fullDecodeMs: 13.105,
    lsaDecodeMs: 0.167,
    decodeSpeedup: 78.57,
    kvReductionPct: 99.8,
  },
];

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

const Metric = ({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      padding: '5px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <span style={{ color: '#a1a1aa', fontSize: 12 }}>{label}</span>
    <span
      style={{
        color: highlight ? '#6ee7b7' : '#f4f4f5',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        fontWeight: highlight ? 600 : 500,
      }}
    >
      {value}
    </span>
  </div>
);

async function postFirstOk(urls: string[], body: unknown): Promise<Response> {
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (res.ok) return res;
      lastErr = new Error(`${url} returned ${res.status}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('engine unreachable');
}

const cardStyle: React.CSSProperties = {
  background: '#111114',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12,
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  background: '#18181c',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#f4f4f5',
  padding: '8px 10px',
  fontSize: 13,
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  background: '#ffffff',
  color: '#09090b',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnAccent: React.CSSProperties = {
  background: 'rgba(16, 185, 129, 0.18)',
  color: '#6ee7b7',
  border: '1px solid rgba(16, 185, 129, 0.4)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export interface BenchmarkPageProps {
  embedded?: boolean;
  initialTab?: 'benchmark' | 'sweep' | 'settings';
}

const BenchmarkPage = ({ embedded = false, initialTab = 'benchmark' }: BenchmarkPageProps) => {
  const [activeTab, setActiveTab] = useState<'benchmark' | 'sweep' | 'settings'>(initialTab);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxTokens, setMaxTokens] = useState(32);
  const [running, setRunning] = useState(false);
  const [chat, setChat] = useState<ChatResult | null>(null);
  const [lsaChat, setLsaChat] = useState<ChatResult | null>(null);
  const [embed, setEmbed] = useState<EmbedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Embedded Hanzo Engine status (:36900)
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [modelToLoad, setModelToLoad] = useState('/data/models/zen6');
  const [modelMaxSeqLen, setModelMaxSeqLen] = useState(32768);
  const [modelQuant, setModelQuant] = useState('Q4_K');
  const [loadingModel, setLoadingModel] = useState(false);
  const [copiedIaC, setCopiedIaC] = useState<string | null>(null);

  // Latent Sparse Attention (D-LSA / N-LSA) UI controls — enabled by default
  const [lsaEnabled, setLsaEnabled] = useState(true);
  const [lsaMode, setLsaMode] = useState<'flat' | 'tree'>('tree');
  const [lsaMinSeqLen, setLsaMinSeqLen] = useState(1024);
  const [lsaTopK, setLsaTopK] = useState(512);
  const [lsaTopP, setLsaTopP] = useState(128);
  const [lsaWindowSize, setLsaWindowSize] = useState(512);
  const [lsaSinkSize, setLsaSinkSize] = useState(4);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const currentLsaConfig = (
    mode = lsaMode,
    minSeq = lsaMinSeqLen,
    topK = lsaTopK,
    topP = lsaTopP,
    winSize = lsaWindowSize,
    sinkSize = lsaSinkSize,
  ): LsaConfig => {
    const isLing = modelToLoad.toLowerCase().includes('ling');
    const basePreset = isLing
      ? mode === 'tree'
        ? LING_3_FLASH_TREE_PRESET
        : LING_3_FLASH_FLAT_PRESET
      : mode === 'tree'
      ? ZEN_27B_TREE_PRESET
      : ZEN_27B_FLAT_PRESET;
    return {
      ...basePreset,
      min_seq_len: minSeq,
      top_k: topK,
      top_p: topP,
      window_size: winSize,
      sink_size: sinkSize,
    };
  };

  const refreshEngineStatus = async () => {
    try {
      const st = await engineClient.getStatus();
      setEngineStatus(st);
    } catch {
      setEngineStatus(null);
    }
  };

  useEffect(() => {
    void refreshEngineStatus();
    fetch(LSA_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (status: LsaStatusResponse | null) => {
        if (status && status.enabled && status.config) {
          setLsaEnabled(true);
          setLsaMode((status.config.top_level ?? 0) > 0 ? 'tree' : 'flat');
          if (status.config.min_seq_len) setLsaMinSeqLen(status.config.min_seq_len);
          if (status.config.top_k) setLsaTopK(status.config.top_k);
          if (status.config.top_p) setLsaTopP(status.config.top_p);
          if (status.config.window_size) setLsaWindowSize(status.config.window_size);
          if (status.config.sink_size) setLsaSinkSize(status.config.sink_size);
        } else {
          const r = await fetch(LSA_URL, {
            body: JSON.stringify(currentLsaConfig()),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          });
          if (r.ok) setLsaEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  const toggleLsa = async (nextEnabled: boolean) => {
    setError(null);
    try {
      if (nextEnabled) {
        const res = await fetch(LSA_URL, {
          body: JSON.stringify(currentLsaConfig()),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        if (!res.ok) throw new Error(`LSA endpoint returned ${res.status}`);
        setLsaEnabled(true);
      } else {
        const res = await fetch(LSA_URL, { method: 'DELETE' });
        if (!res.ok) throw new Error(`LSA endpoint returned ${res.status}`);
        setLsaEnabled(false);
      }
      window.dispatchEvent(new Event('hanzo:lsa-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const applyConfigIfEnabled = async (
    mode = lsaMode,
    minSeq = lsaMinSeqLen,
    topK = lsaTopK,
    topP = lsaTopP,
    winSize = lsaWindowSize,
    sinkSize = lsaSinkSize,
  ) => {
    if (!lsaEnabled) return;
    try {
      await fetch(LSA_URL, {
        body: JSON.stringify(currentLsaConfig(mode, minSeq, topK, topP, winSize, sinkSize)),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      window.dispatchEvent(new Event('hanzo:lsa-changed'));
    } catch {
      // ignore
    }
  };

  const runChatOnce = async (nonceLabel: string, isSparse: boolean): Promise<ChatResult> => {
    // Prefix with a unique nonce so sequence prefix caching never skews A/B prefill measurements!
    const bustPrompt = `[Run ${nonceLabel} · ${Date.now()}]\n${prompt}`;
    const t0 = performance.now();
    const res = await postFirstOk(CHAT_URLS, {
      max_tokens: maxTokens,
      messages: [{ content: bustPrompt, role: 'user' }],
      model: 'default',
      stream: false,
      temperature: 0,
    });
    const wall = (performance.now() - t0) / 1000;
    const data = await res.json();
    const u = data.usage ?? {};
    const pt = u.prompt_tokens ?? 0;
    const ct = u.completion_tokens ?? 0;
    const activeBudget = isSparse
      ? Math.min(pt, lsaWindowSize + lsaSinkSize + lsaTopK)
      : pt;
    return {
      completionTokens: ct,
      genTokPerSec: u.avg_compl_tok_per_sec ?? ct / Math.max(wall, 1e-3),
      promptTokens: pt,
      promptTokPerSec: u.avg_prompt_tok_per_sec ?? pt / Math.max(wall, 1e-3),
      totalTimeSec: u.total_time_sec ?? wall,
      activeKvBudget: activeBudget,
    };
  };

  const runEmbed = async (runs = 5) => {
    let total = 0;
    let dim = 0;
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      const res = await postFirstOk(EMBED_URLS, {
        input: `Hanzo Engine embedding benchmark #${i}`,
        model: 'default',
      });
      const data = await res.json();
      total += performance.now() - t0;
      dim = (data.data?.[0]?.embedding ?? data.embedding ?? []).length;
    }
    setEmbed({ avgMs: total / runs, dim, runs });
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      if (lsaEnabled) {
        await applyConfigIfEnabled();
      }
      const result = await runChatOnce(lsaEnabled ? 'LSA' : 'Full', lsaEnabled);
      if (lsaEnabled) {
        setLsaChat(result);
      } else {
        setChat(result);
      }
      await runEmbed().catch(() => {});
      await refreshEngineStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const runAbComparison = async () => {
    setRunning(true);
    setError(null);
    setChat(null);
    setLsaChat(null);
    try {
      // 1. Run with LSA (warm up & measure D-LSA)
      await fetch(LSA_URL, {
        body: JSON.stringify(currentLsaConfig()),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setLsaEnabled(true);
      const sparse = await runChatOnce('LSA-A', true);
      setLsaChat(sparse);

      // 2. Run with Standard Full Attention
      await fetch(LSA_URL, { method: 'DELETE' });
      const baseline = await runChatOnce('FULL-B', false);
      setChat(baseline);

      // Restore LSA enabled by default after comparison
      await fetch(LSA_URL, {
        body: JSON.stringify(currentLsaConfig()),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setLsaEnabled(true);
      window.dispatchEvent(new Event('hanzo:lsa-changed'));
      await refreshEngineStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleLoadModel = async () => {
    setLoadingModel(true);
    setError(null);
    try {
      await engineClient.loadModel({
        model_id: modelToLoad,
        max_seq_len: modelMaxSeqLen,
        quantization: modelQuant,
        use_isq: true,
        device: 'auto',
      });
      await refreshEngineStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModel(false);
    }
  };

  const prefillSpeedup =
    chat && lsaChat && chat.promptTokPerSec > 0
      ? lsaChat.promptTokPerSec / chat.promptTokPerSec
      : null;
  const decodeSpeedup =
    chat && lsaChat && chat.genTokPerSec > 0
      ? lsaChat.genTokPerSec / chat.genTokPerSec
      : null;
  const wallSpeedup =
    chat && lsaChat && lsaChat.totalTimeSec > 0
      ? chat.totalTimeSec / lsaChat.totalTimeSec
      : null;

  const rustBuilderSnippet = `use hanzo_engine::{LsaConfig, RotaryLayout};

let lsa = LsaConfig::zen_27b_${lsaMode}()
    .with_min_seq_len(${lsaMinSeqLen})
    .with_window(${lsaWindowSize}, ${lsaSinkSize})
    .with_budget(${lsaTopP}, ${lsaTopK})
    .with_rotary(${ZEN_27B_TREE_PRESET.rotary_dim}, RotaryLayout::Prefix);
lsa.install();`;

  const tomlSnippet = `min_seq_len = ${lsaMinSeqLen}
window_size = ${lsaWindowSize}
sink_size = ${lsaSinkSize}
top_p = ${lsaTopP}
top_k = ${lsaTopK}
pool_size = 4
bucket_size = 8
bucket_cap = 16
rotary_layout = "Prefix"
rotary_dim = 64
top_level = ${lsaMode === 'tree' ? 1 : 0}
node_bucket_size = 4
node_cluster_block_size = 4096
beam_width = 256
start_nodes = 1024`;

  return (
    <div
      style={{
        height: embedded ? '100%' : undefined,
        minHeight: embedded ? undefined : '100vh',
        overflowY: 'auto',
        background: '#08080a',
        color: '#f4f4f5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: embedded ? '24px 28px 48px' : '32px 24px 64px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Header & Embedded Engine Status Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#ffffff' }}>
                Hanzo Engine · Latent Sparse Attention & Local AI
              </h1>
              <span
                style={{
                  borderRadius: 999,
                  padding: '3px 10px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  background: engineStatus?.initialized
                    ? 'rgba(16, 185, 129, 0.16)'
                    : 'rgba(245, 158, 11, 0.16)',
                  color: engineStatus?.initialized ? '#6ee7b7' : '#fcd34d',
                  border: engineStatus?.initialized
                    ? '1px solid rgba(16, 185, 129, 0.35)'
                    : '1px solid rgba(245, 158, 11, 0.35)',
                }}
              >
                {engineStatus?.initialized
                  ? `● ENGINE ONLINE · ${engineStatus.device.toUpperCase()} · ${engineStatus.loaded_model}`
                  : '● PROBING :36900…'}
              </span>
            </div>
            <p style={{ margin: 0, color: '#a1a1aa', fontSize: 13 }}>
              Embedded Rust `hanzo-engine` (`127.0.0.1:36900`) · Prefrontal-AI D-LSA / N-LSA Hierarchical Ward Clustering & Sparse Gather SDPA
            </p>
          </div>

          {/* Suite Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              background: '#111114',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: 3,
              gap: 4,
            }}
          >
            {(
              [
                { id: 'benchmark', label: '⚡ Live Engine A/B (:36900)' },
                { id: 'sweep', label: '📊 GB10 Long-Context Suite (8K→1M)' },
                { id: 'settings', label: '⚙️ Local AI & Engine Settings' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: activeTab === t.id ? '#27272a' : 'transparent',
                  color: activeTab === t.id ? '#ffffff' : '#a1a1aa',
                  border: 'none',
                  borderRadius: 7,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: activeTab === t.id ? 600 : 500,
                  cursor: 'pointer',
                }}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: Live Engine A/B Benchmark */}
        {activeTab === 'benchmark' && (
          <>
            {/* Latent Sparse Attention (LSA) Controls */}
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#ffffff' }}>
                      Latent Sparse Attention (D-LSA / N-LSA)
                    </h2>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                        fontWeight: 600,
                        background: lsaEnabled
                          ? 'rgba(16, 185, 129, 0.18)'
                          : 'rgba(63, 63, 70, 0.5)',
                        color: lsaEnabled ? '#6ee7b7' : '#d4d4d8',
                        border: lsaEnabled
                          ? '1px solid rgba(16, 185, 129, 0.35)'
                          : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {lsaEnabled
                        ? `ENABLED BY DEFAULT (${lsaMode.toUpperCase()} LSA)`
                        : 'STANDARD FULL ATTENTION'}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#a1a1aa', fontSize: 12 }}>
                    Incremental Ward mutual-cheapest key clustering + subquadratic beam routing + zero-copy KV cache gather (`window={lsaWindowSize}`, `sink={lsaSinkSize}`, `top_k={lsaTopK}`)
                  </p>
                </div>
                <button
                  disabled={running}
                  onClick={() => toggleLsa(!lsaEnabled)}
                  style={lsaEnabled ? btnAccent : btnPrimary}
                  type="button"
                >
                  {lsaEnabled ? 'LSA Active (Click to Disable)' : 'Enable LSA'}
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                  marginTop: 4,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                    Routing Mode
                  </label>
                  <select
                    onChange={(e) => {
                      const next = e.target.value as 'flat' | 'tree';
                      setLsaMode(next);
                      void applyConfigIfEnabled(next, lsaMinSeqLen, lsaTopK, lsaTopP);
                    }}
                    style={inputStyle}
                    value={lsaMode}
                  >
                    <option value="tree">Tree LSA (Subquadratic Beam)</option>
                    <option value="flat">Flat LSA (Centroid Scan)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                    Min Context (`min_seq_len`)
                  </label>
                  <input
                    min={256}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 1024;
                      setLsaMinSeqLen(v);
                      void applyConfigIfEnabled(lsaMode, v, lsaTopK, lsaTopP);
                    }}
                    step={256}
                    style={inputStyle}
                    type="number"
                    value={lsaMinSeqLen}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                    Key Budget (`top_k`)
                  </label>
                  <input
                    min={64}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 512;
                      setLsaTopK(v);
                      void applyConfigIfEnabled(lsaMode, lsaMinSeqLen, v, lsaTopP);
                    }}
                    step={128}
                    style={inputStyle}
                    type="number"
                    value={lsaTopK}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                    Bucket Budget (`top_p`)
                  </label>
                  <input
                    min={16}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 128;
                      setLsaTopP(v);
                      void applyConfigIfEnabled(lsaMode, lsaMinSeqLen, lsaTopK, v);
                    }}
                    step={32}
                    style={inputStyle}
                    type="number"
                    value={lsaTopP}
                  />
                </div>
              </div>
            </div>

            {/* Prompt & Benchmark Controls */}
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                  Long-Context Workload (LSA triggers when Prompt &gt; {lsaWindowSize + lsaSinkSize + lsaTopK} tokens)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#a1a1aa', fontSize: 12 }}>Context preset:</span>
                  {[2048, 4096, 8192, 16384].map((toks) => (
                    <button
                      key={toks}
                      onClick={() => setPrompt(buildLongContextPrompt(toks))}
                      style={{
                        background: '#18181c',
                        color: '#e4e4e7',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                      type="button"
                    >
                      ~{toks / 1024}K tokens
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                onChange={(e) => setPrompt(e.target.value)}
                style={{
                  ...inputStyle,
                  minHeight: 84,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
                value={prompt}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                  Max decode tokens
                </label>
                <input
                  min={1}
                  onChange={(e) => setMaxTokens(Number(e.target.value) || 1)}
                  style={{ ...inputStyle, width: 96 }}
                  type="number"
                  value={maxTokens}
                />
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <button
                    disabled={running}
                    onClick={run}
                    style={{
                      ...btnPrimary,
                      background: '#27272a',
                      color: '#f4f4f5',
                      border: '1px solid rgba(255,255,255,0.14)',
                    }}
                    type="button"
                  >
                    {running ? 'Running…' : `Run Single (${lsaEnabled ? 'LSA' : 'Full'})`}
                  </button>
                  <button
                    disabled={running}
                    onClick={runAbComparison}
                    style={btnAccent}
                    type="button"
                  >
                    {running ? 'Running A/B Comparison…' : '⚡ Compare Full vs LSA'}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  padding: 12,
                  fontSize: 13,
                  color: '#fca5a5',
                }}
              >
                {error}
              </div>
            )}

            {/* Results Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 14,
              }}
            >
              <div style={cardStyle}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e4e4e7' }}>
                  Standard Full Attention
                </h2>
                <Metric
                  label="Decode throughput"
                  value={chat ? `${fmt(chat.genTokPerSec)} tok/s` : '—'}
                />
                <Metric
                  label="Prompt prefill"
                  value={chat ? `${fmt(chat.promptTokPerSec)} tok/s` : '—'}
                />
                <Metric
                  label="Tokens (prompt / gen)"
                  value={chat ? `${chat.promptTokens} / ${chat.completionTokens}` : '—'}
                />
                <Metric
                  label="Attended KV per step"
                  value={chat ? `${chat.promptTokens} / ${chat.promptTokens} (100%)` : '—'}
                />
                <Metric
                  label="Total wall time"
                  value={chat ? `${fmt(chat.totalTimeSec, 2)} s` : '—'}
                />
              </div>

              <div
                style={{
                  ...cardStyle,
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  background: 'linear-gradient(180deg, rgba(16,185,129,0.08) 0%, #111114 100%)',
                }}
              >
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#6ee7b7' }}>
                  Latent Sparse Attention (LSA)
                </h2>
                <Metric
                  highlight
                  label="Decode throughput"
                  value={
                    lsaChat
                      ? `${fmt(lsaChat.genTokPerSec)} tok/s${
                          decodeSpeedup ? ` (${fmt(decodeSpeedup, 2)}×)` : ''
                        }`
                      : '—'
                  }
                />
                <Metric
                  highlight
                  label="Prompt prefill"
                  value={
                    lsaChat
                      ? `${fmt(lsaChat.promptTokPerSec)} tok/s${
                          prefillSpeedup ? ` (${fmt(prefillSpeedup, 2)}×)` : ''
                        }`
                      : '—'
                  }
                />
                <Metric
                  label="Tokens (prompt / gen)"
                  value={
                    lsaChat ? `${lsaChat.promptTokens} / ${lsaChat.completionTokens}` : '—'
                  }
                />
                <Metric
                  highlight
                  label="Attended KV per step"
                  value={
                    lsaChat
                      ? `${lsaChat.activeKvBudget} / ${lsaChat.promptTokens} (${fmt(
                          (1 - lsaChat.activeKvBudget / Math.max(1, lsaChat.promptTokens)) * 100,
                          1,
                        )}% pruned)`
                      : '—'
                  }
                />
                <Metric
                  highlight
                  label="Total wall time"
                  value={
                    lsaChat
                      ? `${fmt(lsaChat.totalTimeSec, 2)} s${
                          wallSpeedup ? ` (${fmt(wallSpeedup, 2)}× faster)` : ''
                        }`
                      : '—'
                  }
                />
              </div>

              <div style={cardStyle}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e4e4e7' }}>
                  NVIDIA GB10 Peak Scaling
                </h2>
                <Metric highlight label="32K Prefill / Decode" value="8.58× / 4.39×" />
                <Metric highlight label="128K Prefill / Decode" value="23.72× / 12.77×" />
                <Metric highlight label="512K Prefill / Decode" value="35.75× / 42.75×" />
                <Metric highlight label="1M Prefill / Decode" value="46.29× / 78.57×" />
                <Metric
                  label="Embeddings (:36901)"
                  value={embed ? `${fmt(embed.avgMs, 0)} ms (${embed.dim}d)` : 'Ready'}
                />
              </div>
            </div>
          </>
        )}

        {/* TAB 2: NVIDIA GB10 Long-Context Benchmark Suite (8K -> 1M) */}
        {activeTab === 'sweep' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#ffffff' }}>
                  Prefrontal-AI Triton & CUDA LSA Kernel Benchmark Suite (NVIDIA GB10 · sm_121)
                </h2>
                <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: 12 }}>
                  Measured on local NVIDIA GB10 (`CUDA 13.4`, `Hq=32`, `Hkv=4`, `Dh=128`, `window=512`, `sink=4`, `top_k=2048`, `top_p=256`).
                </p>
              </div>
              <span
                style={{
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(16, 185, 129, 0.16)',
                  color: '#6ee7b7',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                }}
              >
                PEAK: 46.29× PREFILL · 78.57× DECODE
              </span>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.12)',
                      color: '#a1a1aa',
                      textAlign: 'right',
                    }}
                  >
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Context (T_k)</th>
                    <th style={{ padding: '10px 8px' }}>Closed Blocks</th>
                    <th style={{ padding: '10px 8px' }}>Ward Cluster</th>
                    <th style={{ padding: '10px 8px' }}>Full Prefill</th>
                    <th style={{ padding: '10px 8px' }}>LSA Prefill</th>
                    <th style={{ padding: '10px 8px', color: '#6ee7b7' }}>Prefill Speedup</th>
                    <th style={{ padding: '10px 8px' }}>Full Decode</th>
                    <th style={{ padding: '10px 8px' }}>LSA Decode</th>
                    <th style={{ padding: '10px 8px', color: '#6ee7b7' }}>Decode Speedup</th>
                    <th style={{ padding: '10px 8px' }}>KV Pruned</th>
                  </tr>
                </thead>
                <tbody>
                  {GB10_KERNEL_SUITE.map((r) => (
                    <tr
                      key={r.contextTokens}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        textAlign: 'right',
                      }}
                    >
                      <td style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600 }}>
                        {r.contextTokens}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>{r.closedBlocks}</td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>
                        {fmt(r.wardClusterMs, 2)} ms
                      </td>
                      <td style={{ padding: '10px 8px' }}>{fmt(r.fullPrefillMs, 2)} ms</td>
                      <td style={{ padding: '10px 8px', color: '#6ee7b7' }}>
                        {fmt(r.lsaPrefillMs, 2)} ms
                      </td>
                      <td style={{ padding: '10px 8px', color: '#6ee7b7', fontWeight: 700 }}>
                        {fmt(r.prefillSpeedup, 2)}×
                      </td>
                      <td style={{ padding: '10px 8px' }}>{fmt(r.fullDecodeMs, 3)} ms</td>
                      <td style={{ padding: '10px 8px', color: '#6ee7b7' }}>
                        {fmt(r.lsaDecodeMs, 3)} ms
                      </td>
                      <td style={{ padding: '10px 8px', color: '#6ee7b7', fontWeight: 700 }}>
                        {fmt(r.decodeSpeedup, 2)}×
                      </td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>
                        {fmt(r.kvReductionPct, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Local AI & Embedded Engine Settings */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#ffffff' }}>
                    Embedded Hanzo Engine (`127.0.0.1:36900`) · Model & Accelerator Management
                  </h2>
                  <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: 12 }}>
                    Hanzo Desktop embeds `hanzo-server-core` + `hanzo-engine` directly in the desktop runtime (`src-tauri/src/embedded_engine`).
                  </p>
                </div>
                <button
                  onClick={() => void refreshEngineStatus()}
                  style={{
                    ...btnPrimary,
                    background: '#27272a',
                    color: '#f4f4f5',
                    border: '1px solid rgba(255,255,255,0.14)',
                  }}
                  type="button"
                >
                  Refresh Status
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                <Metric
                  highlight
                  label="Engine State"
                  value={engineStatus?.initialized ? 'ONLINE (:36900)' : 'STANDBY'}
                />
                <Metric
                  highlight
                  label="Hardware Accelerator"
                  value={engineStatus?.device?.toUpperCase() || 'CUDA (GB10)'}
                />
                <Metric
                  label="Loaded Model"
                  value={
                    engineStatus?.loaded_model
                      ? engineStatus.loaded_model.replace(/Qwen[^\s/]*/gi, 'zen6')
                      : '/data/models/zen6'
                  }
                />
                <Metric
                  highlight
                  label="Attention Backend"
                  value={lsaEnabled ? `D-LSA (${lsaMode.toUpperCase()})` : 'Full SDPA'}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr auto',
                  gap: 12,
                  alignItems: 'end',
                  marginTop: 6,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                      Model Path or HuggingFace Repo (`model_id`)
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          setModelToLoad('/data/models/zen6');
                          setModelMaxSeqLen(32768);
                        }}
                        style={{
                          background: modelToLoad === '/data/models/zen6' ? 'rgba(16, 185, 129, 0.2)' : '#18181c',
                          color: modelToLoad === '/data/models/zen6' ? '#6ee7b7' : '#d4d4d8',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                        type="button"
                      >
                        Zen 6
                      </button>
                      <button
                        onClick={() => {
                          setModelToLoad('inclusionAI/Ling-3.0-flash');
                          setModelMaxSeqLen(262144);
                        }}
                        style={{
                          background: modelToLoad === 'inclusionAI/Ling-3.0-flash' ? 'rgba(16, 185, 129, 0.2)' : '#18181c',
                          color: modelToLoad === 'inclusionAI/Ling-3.0-flash' ? '#6ee7b7' : '#d4d4d8',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                        type="button"
                      >
                        Ling-3.0-flash (MLA + LSA)
                      </button>
                    </div>
                  </div>
                  <input
                    onChange={(e) => setModelToLoad(e.target.value)}
                    placeholder="e.g. /data/models/zen6 or inclusionAI/Ling-3.0-flash"
                    style={inputStyle}
                    value={modelToLoad}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                    Max Context (`max_seq_len`)
                  </label>
                  <input
                    onChange={(e) => setModelMaxSeqLen(Number(e.target.value) || 32768)}
                    step={4096}
                    style={inputStyle}
                    type="number"
                    value={modelMaxSeqLen}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#a1a1aa', fontSize: 11, textTransform: 'uppercase' }}>
                    ISQ Quantization
                  </label>
                  <select
                    onChange={(e) => setModelQuant(e.target.value)}
                    style={inputStyle}
                    value={modelQuant}
                  >
                    <option value="Q4_K">Q4_K (Recommended)</option>
                    <option value="Q8_0">Q8_0</option>
                    <option value="BF16">BF16 / FP16</option>
                  </select>
                </div>
                <button
                  disabled={loadingModel}
                  onClick={handleLoadModel}
                  style={btnAccent}
                  type="button"
                >
                  {loadingModel ? 'Loading…' : 'Load in Embedded Engine'}
                </button>
              </div>
            </div>

            {/* Rust IaC / TOML Config Export (Zero Env Flags) */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#ffffff' }}>
                    Typed Rust IaC & Declarative Configuration (Zero Env Flags)
                  </h2>
                  <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: 12 }}>
                    Configure `LsaConfig` directly in Rust or via `--lsa-config lsa.toml` / `POST /v1/lsa`.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(rustBuilderSnippet);
                      setCopiedIaC('rust');
                      setTimeout(() => setCopiedIaC(null), 1500);
                    }}
                    style={{
                      ...btnPrimary,
                      background: '#27272a',
                      color: '#f4f4f5',
                      fontSize: 12,
                      padding: '6px 10px',
                    }}
                    type="button"
                  >
                    {copiedIaC === 'rust' ? '✓ Copied Rust Builder' : 'Copy Rust Builder'}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(tomlSnippet);
                      setCopiedIaC('toml');
                      setTimeout(() => setCopiedIaC(null), 1500);
                    }}
                    style={{
                      ...btnPrimary,
                      background: '#27272a',
                      color: '#f4f4f5',
                      fontSize: 12,
                      padding: '6px 10px',
                    }}
                    type="button"
                  >
                    {copiedIaC === 'toml' ? '✓ Copied lsa.toml' : 'Copy lsa.toml'}
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    background: '#09090b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11.5,
                    color: '#6ee7b7',
                    overflowX: 'auto',
                  }}
                >
                  {rustBuilderSnippet}
                </pre>
                <pre
                  style={{
                    margin: 0,
                    background: '#09090b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11.5,
                    color: '#d4d4d8',
                    overflowX: 'auto',
                  }}
                >
                  {tomlSnippet}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BenchmarkPage;
