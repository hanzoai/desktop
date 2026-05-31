/**
 * Local model discovery via the local Hanzo Engine.
 *
 * The desktop talks ONLY to the local OpenAI-compatible Hanzo Engine. Model
 * discovery has exactly ONE canonical path: `GET {engineUrl}/v1/engine/models`.
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
 * Normalized local-model entry. Downstream code reads `.model` / `.name`; the
 * remaining fields are best-effort/empty since `/v1/engine/models` does not provide
 * them.
 */
export type ScanLocalModelsResponse = {
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

const emptyDetails = (): ScanLocalModelsResponse[number]['details'] => ({
  families: [],
  family: '',
  format: '',
  parameter_size: '',
  parent_model: '',
  quantization_level: '',
});

/**
 * List locally available models from the engine via `GET {engineUrl}/v1/engine/models`.
 * `nodeAddress`/`bearerToken` are accepted for call-site compatibility but the
 * engine is local + OpenAI-compatible, so they are not used to reach it.
 */
export const scanLocalModels = async (
  _nodeAddress?: string,
  _bearerToken?: string,
): Promise<ScanLocalModelsResponse> => {
  const response = await fetch(`${ENGINE_BASE_URL}/v1/engine/models`);
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
