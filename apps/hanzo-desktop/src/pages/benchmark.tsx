import { Button } from '@hanzo_network/hanzo-ui';
import { useState } from 'react';

// The local Zen engines (hanzo-engine / mistral.rs). Chat is OpenAI-compatible on
// :36900; embeddings on :36901. The engine sends `access-control-allow-origin: *`,
// so the webview can call them directly with native fetch.
const CHAT_URL = 'http://localhost:36900/v1/engine/chat/completions';
const EMBED_URL = 'http://localhost:36901/v1/engine/embeddings';
const DEFAULT_PROMPT =
  'Write a clear, three-sentence explanation of how photosynthesis works.';

type ChatResult = {
  promptTokens: number;
  completionTokens: number;
  totalTimeSec: number;
  promptTokPerSec: number;
  genTokPerSec: number;
};

type EmbedResult = { avgMs: number; dim: number; runs: number };

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-text-secondary text-xs">{label}</span>
    <span className="text-text-default font-mono text-sm">{value}</span>
  </div>
);

const BenchmarkPage = () => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxTokens, setMaxTokens] = useState(128);
  const [running, setRunning] = useState(false);
  const [chat, setChat] = useState<ChatResult | null>(null);
  const [embed, setEmbed] = useState<EmbedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runChat = async () => {
    const t0 = performance.now();
    const res = await fetch(CHAT_URL, {
      body: JSON.stringify({
        max_tokens: maxTokens,
        messages: [{ content: prompt, role: 'user' }],
        model: 'default',
        stream: false,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!res.ok) throw new Error(`chat engine returned ${res.status}`);
    const wall = (performance.now() - t0) / 1000;
    const data = await res.json();
    const u = data.usage ?? {};
    const pt = u.prompt_tokens ?? 0;
    const ct = u.completion_tokens ?? 0;
    setChat({
      completionTokens: ct,
      genTokPerSec: u.avg_compl_tok_per_sec ?? ct / Math.max(wall, 1e-3),
      promptTokens: pt,
      promptTokPerSec: u.avg_prompt_tok_per_sec ?? pt / Math.max(wall, 1e-3),
      totalTimeSec: u.total_time_sec ?? wall,
    });
  };

  const runEmbed = async (runs = 5) => {
    let total = 0;
    let dim = 0;
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      const res = await fetch(EMBED_URL, {
        body: JSON.stringify({ model: 'default', input: `${prompt} #${i}` }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!res.ok) throw new Error(`embedding engine returned ${res.status}`);
      const data = await res.json();
      total += performance.now() - t0;
      // OpenAI /v1/engine/embeddings shape: { data: [{ embedding: number[] }] }
      dim = (data.data?.[0]?.embedding ?? data.embedding ?? []).length;
    }
    setEmbed({ avgMs: total / runs, dim, runs });
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setChat(null);
    setEmbed(null);
    try {
      await runChat();
      await runEmbed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-white">Engine Benchmark</h1>
        <p className="text-text-secondary text-sm">
          Measure local Zen Engine throughput — prompt processing & generation
          tokens/sec, plus embedding latency. Runs directly against the local
          engines (:36900 chat, :36901 embeddings).
        </p>
      </div>

      <div className="border-divider bg-bg-secondary flex flex-col gap-3 rounded-xl border p-4">
        <label className="text-text-secondary text-xs uppercase">Prompt</label>
        <textarea
          className="bg-bg-tertiary text-text-default min-h-[80px] resize-y rounded-lg p-3 text-sm outline-none"
          onChange={(e) => setPrompt(e.target.value)}
          value={prompt}
        />
        <div className="flex items-center gap-3">
          <label className="text-text-secondary text-xs uppercase">
            Max tokens
          </label>
          <input
            className="bg-bg-tertiary text-text-default w-24 rounded-lg p-2 text-sm outline-none"
            min={1}
            onChange={(e) => setMaxTokens(Number(e.target.value) || 1)}
            type="number"
            value={maxTokens}
          />
          <Button className="ml-auto" disabled={running} onClick={run}>
            {running ? 'Running…' : 'Run Benchmark'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="border-divider bg-bg-secondary flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-medium text-white">Chat (generation)</h2>
          <Metric
            label="Generation"
            value={chat ? `${fmt(chat.genTokPerSec)} tok/s` : '—'}
          />
          <Metric
            label="Prompt processing"
            value={chat ? `${fmt(chat.promptTokPerSec)} tok/s` : '—'}
          />
          <Metric
            label="Tokens (prompt / gen)"
            value={chat ? `${chat.promptTokens} / ${chat.completionTokens}` : '—'}
          />
          <Metric
            label="Total time"
            value={chat ? `${fmt(chat.totalTimeSec, 2)} s` : '—'}
          />
        </div>
        <div className="border-divider bg-bg-secondary flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-medium text-white">Embeddings</h2>
          <Metric
            label="Avg latency"
            value={embed ? `${fmt(embed.avgMs, 0)} ms` : '—'}
          />
          <Metric
            label="Throughput"
            value={embed ? `${fmt(1000 / embed.avgMs)} /s` : '—'}
          />
          <Metric label="Dimension" value={embed ? `${embed.dim}` : '—'} />
          <Metric label="Runs" value={embed ? `${embed.runs}` : '—'} />
        </div>
      </div>
    </div>
  );
};

export default BenchmarkPage;
