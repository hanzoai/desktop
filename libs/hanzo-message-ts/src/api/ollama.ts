/**
 * Local model discovery via the Hanzo Engine.
 *
 * Historically this module talked to Ollama and the node's `/v2/scan_ollama_models`
 * RPC. Ollama is fully retired and the cloud free-tier is gone: the desktop now
 * talks ONLY to the local OpenAI-compatible Hanzo Engine. Model discovery has
 * exactly ONE canonical path: `GET {engineUrl}/v1/models`.
 *
 * The function/type names are kept so existing call sites compile unchanged, but
 * there is no Ollama and no `/api/*` anywhere in here.
 */

// Default engine endpoint (OpenAI-compatible). Mirrors lib/hanzo-engine/client.ts.
// Override with VITE_ENGINE_BASE_URL when pointing at a different engine.
const ENGINE_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_ENGINE_BASE_URL) ||
  'http://127.0.0.1:36900';

/** OpenAI `/v1/models` entry. */
type OpenAIModel = {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  status?: string;
};

/**
 * Shape preserved from the legacy Ollama scan response so downstream code that
 * reads `.model` / `.name` keeps working. Only `model` and `name` are populated
 * from `/v1/models`; the rest are best-effort/empty.
 */
export type ScanOllamaModelsResponse = {
  details: {
    families: string[];
    family: string;
    format: string;
    parameter_size: string;
    parent_model: string;
    quantization_level: string;
  };
  digest: string;
  model: string;
  modified_at: string;
  name: string;
  port_used: string;
  size: number;
}[];

const emptyDetails = (): ScanOllamaModelsResponse[number]['details'] => ({
  families: [],
  family: '',
  format: '',
  parameter_size: '',
  parent_model: '',
  quantization_level: '',
});

/**
 * List locally available models from the engine via `GET {engineUrl}/v1/models`.
 * `nodeAddress`/`bearerToken` are accepted for call-site compatibility but the
 * engine is local + OpenAI-compatible, so they are not used to reach it.
 */
export const scanOllamaModels = async (
  _nodeAddress?: string,
  _bearerToken?: string,
): Promise<ScanOllamaModelsResponse> => {
  const response = await fetch(`${ENGINE_BASE_URL}/v1/models`);
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  const body = (await response.json()) as { data?: OpenAIModel[] };
  const models = body.data ?? [];
  return models.map((m) => ({
    details: emptyDetails(),
    digest: '',
    model: m.id,
    modified_at: m.created ? new Date(m.created * 1000).toISOString() : '',
    name: m.id,
    port_used: '',
    size: 0,
  }));
};

export type AddOllamaModelsRequest = {
  models: string[];
};

/**
 * No-op. The engine owns its own model lifecycle and auto-discovers what is
 * available via `/v1/models`; there is nothing to "add" from the desktop.
 */
export const addOllamaModels = async (
  _nodeAddress?: string,
  _bearerToken?: string,
  _payload?: AddOllamaModelsRequest,
): Promise<{ status: string }> => {
  return { status: 'success' };
};
