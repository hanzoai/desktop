// The one seam between the Local AI screen and Hanzo's engine on this
// computer: the Tauri commands in src-tauri/src/local_models.rs, and which
// catalogue models the engine can actually fetch.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { isTauriAvailable } from '../utils/tauri-check';

/** Where the served model answers (local_models.rs `PORT`). */
export const LOCAL_ENGINE_URL = 'http://127.0.0.1:36900';
export const PROGRESS_EVENT = 'local-models-progress';
/** What a cancelled download fails with (local_models.rs `CANCELLED`). */
export const CANCELLED = 'Download cancelled.';
/** Where a person gets the engine. Release bundles do not ship it. */
export const ENGINE_RELEASES_URL = 'https://github.com/hanzoai/engine/releases/latest';

export interface LocalSource {
  /** The catalogue tag the rest of the app (model picker, chat) knows it by. */
  tag: string;
  /** The Hugging Face repository the engine loads. */
  repo: string;
  /** What the download actually fetches (local_models.rs `wanted`), measured 2026-11-21. */
  bytes: number;
  title: string;
  /** One honest sentence: what it is good for. */
  blurb: string;
}

// Only models whose weights the engine can fetch and load (safetensors, not
// gated). Every other catalogue entry names an Ollama tag, which this app no
// longer downloads from, so it is listed but cannot be downloaded yet.
export const LOCAL_SOURCES: LocalSource[] = [
  { tag: 'zen-nano:0.6b', repo: 'zenlm/zen-nano-0.6b', bytes: 1_208_033_536, title: 'Zen Nano', blurb: 'Small and quick. Good for short questions and drafts.' },
  { tag: 'qwen3:0.6b', repo: 'Qwen/Qwen3-0.6B', bytes: 1_519_209_243, title: 'Qwen3 0.6B', blurb: 'Small general model from Alibaba. Quick, but makes more mistakes.' },
  { tag: 'smollm2:360m', repo: 'HuggingFaceTB/SmolLM2-360M-Instruct', bytes: 727_119_969, title: 'SmolLM2 360M', blurb: 'Tiny and very fast. Fine for simple rewording, weak at facts.' },
  { tag: 'smollm2:135m', repo: 'HuggingFaceTB/SmolLM2-135M-Instruct', bytes: 272_504_690, title: 'SmolLM2 135M', blurb: 'The smallest here. Mostly useful for testing.' },
  { tag: 'qwen3:1.7b', repo: 'Qwen/Qwen3-1.7B', bytes: 4_079_450_110, title: 'Qwen3 1.7B', blurb: 'Better answers than the small models, needs more memory.' },
  { tag: 'deepseek-r1:1.5b', repo: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B', bytes: 3_561_268_789, title: 'DeepSeek R1 1.5B', blurb: 'Thinks step by step before answering. Slower.' },
  { tag: 'smollm2:1.7b', repo: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', bytes: 3_426_266_838, title: 'SmolLM2 1.7B', blurb: 'Balanced small model for everyday writing.' },
  { tag: 'zen-agent:4b', repo: 'zenlm/zen-agent-4b', bytes: 8_060_913_184, title: 'Zen Agent', blurb: 'Tuned for multi-step tasks. Needs a computer with lots of memory.' },
  { tag: 'qwen3:4b', repo: 'Qwen/Qwen3-4B', bytes: 8_060_926_626, title: 'Qwen3 4B', blurb: 'Strong general model. Needs a computer with lots of memory.' },
];

export const sourceForTag = (tag: string) => LOCAL_SOURCES.find((s) => s.tag === tag);
export const sourceForRepo = (repo: string) => LOCAL_SOURCES.find((s) => s.repo === repo);

/** Memory a model needs while it answers: its weights plus about 1 GB for the engine. */
export function memoryNeededGb(bytes: number): number {
  return Math.ceil(bytes / 1e9 + 1);
}

/** Half the memory is left to the system and the person's other apps. */
export function fitsThisMac(bytes: number, ramGb: number): boolean {
  return memoryNeededGb(bytes) <= ramGb / 2;
}

export function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export interface EngineStatus {
  /** The engine binary, or null when none is installed. */
  engine: string | null;
  cache_dir: string;
  installed: Array<{ repo: string; bytes: number }>;
  pulling: string | null;
  serving: string | null;
  serve_error: string | null;
}

/** The engine's state, or null outside the desktop app (a plain browser). */
export async function engineStatus(): Promise<EngineStatus | null> {
  if (!isTauriAvailable()) return null;
  return invoke<EngineStatus>('local_models_status');
}

/** This computer's memory in GB, or null when it cannot be read. */
export async function memoryGb(): Promise<number | null> {
  if (!isTauriAvailable()) return null;
  try {
    const s = await invoke<{ hardware?: { memory?: number } }>('hardware_get_summary');
    return typeof s?.hardware?.memory === 'number' && s.hardware.memory > 0 ? s.hardware.memory : null;
  } catch {
    return null;
  }
}

/** Download `repo`; `onPercent` hears 0-100 as bytes arrive. Rejects with the reason in words. */
export async function pullModel(repo: string, onPercent: (percent: number) => void): Promise<void> {
  const unlisten = await listen<{ repo: string; done: number; total: number }>(PROGRESS_EVENT, (e) => {
    const { repo: r, done, total } = e.payload;
    // Floor, so 100 is said only by the finished download.
    if (r === repo && total > 0) onPercent(Math.min(100, Math.floor((done / total) * 100)));
  });
  try {
    await invoke('local_models_pull', { repo });
  } finally {
    unlisten();
  }
}

export const cancelPull = () => invoke<boolean>('local_models_cancel');
export const removeModel = (repo: string) => invoke<void>('local_models_remove', { repo });
export const serveModel = (repo: string) => invoke<void>('local_models_serve', { repo });
export const stopModel = () => invoke<void>('local_models_stop');

/** Wait until the served model answers, or give up after `timeoutMs`. */
export async function waitForEngine(timeoutMs = 120_000, stepMs = 500): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${LOCAL_ENGINE_URL}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    // A process that died while loading will not come up; stop waiting for it.
    const s = await engineStatus().catch(() => null);
    if (s && !s.serving) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

/** The error text a rejected invoke carries (Rust returns a plain string). */
export function reason(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export type Overall =
  | { kind: 'app-only' }
  | { kind: 'no-engine'; installed: number }
  | { kind: 'ready'; installed: number }
  | { kind: 'running'; repo: string };

/** The one status the top of the screen shows. */
export function overall(status: EngineStatus | null): Overall {
  if (!status) return { kind: 'app-only' };
  if (status.serving) return { kind: 'running', repo: status.serving };
  if (!status.engine) return { kind: 'no-engine', installed: status.installed.length };
  return { kind: 'ready', installed: status.installed.length };
}
