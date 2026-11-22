/**
 * Lightweight client for connecting desktop apps to any local or remote
 * OpenAI-compatible inference server (for example hanzo-engine, llama.cpp,
 * Ollama, or vLLM) with zero proprietary cloud dependencies.
 */

export const DEFAULT_LOCAL_ENGINE_URL = 'http://127.0.0.1:36900';

export interface EngineHealth {
  online: boolean;
  baseUrl: string;
  models: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Estimates runtime memory (in GB) needed to load model weights plus KV/runtime overhead.
 */
export function memoryNeededGb(weightBytes: number): number {
  return Math.ceil(weightBytes / 1e9 + 1);
}

/**
 * Checks whether a model fits comfortably within half of total system memory.
 */
export function fitsSystemRam(weightBytes: number, totalRamGb: number): boolean {
  return memoryNeededGb(weightBytes) <= totalRamGb / 2;
}

/**
 * Formats byte counts into human-readable MB or GB strings.
 */
export function formatBytes(bytes: number): string {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/**
 * Fetches model identifiers exposed by an OpenAI-compatible `/v1/models` endpoint.
 */
export async function fetchEngineModels(
  baseUrl = DEFAULT_LOCAL_ENGINE_URL,
  timeoutMs = 2_000,
): Promise<string[]> {
  const clean = baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${clean}/v1/models`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Engine models check returned HTTP ${res.status}`);
  }
  const payload = (await res.json()) as {
    data?: Array<{ id?: string }>;
  };
  return (payload.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => Boolean(id));
}

/**
 * Probes an OpenAI-compatible local inference server and returns its online
 * status alongside discovered model IDs.
 */
export async function probeEngineHealth(
  baseUrl = DEFAULT_LOCAL_ENGINE_URL,
  timeoutMs = 1_500,
): Promise<EngineHealth> {
  const clean = baseUrl.replace(/\/+$/, '');
  try {
    const models = await fetchEngineModels(clean, timeoutMs);
    return { online: true, baseUrl: clean, models };
  } catch {
    try {
      const health = await fetch(`${clean}/health`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { online: health.ok, baseUrl: clean, models: [] };
    } catch {
      return { online: false, baseUrl: clean, models: [] };
    }
  }
}

/**
 * Sends a non-streaming chat completion request to an OpenAI-compatible endpoint.
 */
export async function sendChatCompletion({
  baseUrl = DEFAULT_LOCAL_ENGINE_URL,
  apiKey,
  model,
  messages,
  signal,
}: {
  baseUrl?: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const clean = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const res = await fetch(`${clean}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: false }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Chat request failed with HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? '';
}
