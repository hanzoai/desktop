/**
 * Ollama ModelManager implementation.
 *
 * Provides model discovery and management via Ollama's API:
 * - List installed models via /api/tags
 * - Pull models via /api/pull with streaming progress
 * - Remove models via /api/delete
 * - Search Ollama library (via ollama.com registry)
 *
 * Uses the `ollama` npm package for API calls when available,
 * falls back to raw fetch for environments without it.
 */

import type {
  AvailableModel,
  InstalledModel,
  ModelInfo,
  ModelManager,
  ModelManagerCapabilities,
  PullOptions,
  PullProgress,
  SearchOptions,
} from './types';

/**
 * Ollama API configuration.
 */
export interface OllamaManagerConfig {
  /** Ollama API host (default: http://127.0.0.1:11434) */
  readonly host?: string;
  /** Custom fetch function (for environments that need header filtering) */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Ollama model list response shape.
 */
interface OllamaListResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      parent_model?: string;
      format?: string;
      family?: string;
      families?: string[];
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

/**
 * Ollama pull progress response shape.
 */
interface OllamaPullResponse {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/**
 * Ollama show response shape.
 */
interface OllamaShowResponse {
  license?: string;
  modelfile?: string;
  parameters?: string;
  template?: string;
  system?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

const DEFAULT_HOST = 'http://127.0.0.1:11434';

/**
 * Parse model name into base name and tag.
 */
function parseModelName(fullName: string): { name: string; tag: string } {
  const colonIndex = fullName.indexOf(':');
  if (colonIndex === -1) {
    return { name: fullName, tag: 'latest' };
  }
  return {
    name: fullName.substring(0, colonIndex),
    tag: fullName.substring(colonIndex + 1),
  };
}

/**
 * Capabilities for Ollama model manager.
 */
export const OLLAMA_MANAGER_CAPABILITIES: ModelManagerCapabilities = {
  canSearch: false, // Ollama library search requires scraping or registry API
  hasProgress: true,
  canCancel: true,
  canResume: true,
  hasMining: false,
};

/**
 * Ollama ModelManager implementation.
 */
export class OllamaModelManager implements ModelManager {
  readonly engineId = 'ollama';

  private readonly host: string;
  private readonly customFetch: typeof globalThis.fetch;

  constructor(config: OllamaManagerConfig = {}) {
    this.host = config.host ?? DEFAULT_HOST;
    this.customFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Remove headers that cause CORS issues in browser environments.
   */
  private async fetch(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const url = `${this.host}${path}`;
    const headers = { ...(init?.headers as Record<string, string>) };
    delete headers['User-Agent'];

    return this.customFetch(url, { ...init, headers });
  }

  async getInstalledModels(): Promise<InstalledModel[]> {
    const response = await this.fetch('/api/tags');
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaListResponse;
    return data.models.map((model) => {
      const { name, tag } = parseModelName(model.name);
      return {
        id: model.name,
        name,
        tag,
        sizeBytes: model.size,
        modifiedAt: new Date(model.modified_at),
        digest: model.digest,
        metadata: {
          family: model.details?.family,
          families: model.details?.families,
          format: model.details?.format,
          parameterSize: model.details?.parameter_size,
          quantizationLevel: model.details?.quantization_level,
          parentModel: model.details?.parent_model,
        },
      };
    });
  }

  async getAvailableModels(): Promise<AvailableModel[]> {
    // Ollama does not provide a registry API.
    // Return an empty array - use searchModels with a repository instead.
    // UI should load from a static model repository JSON.
    return [];
  }

  async searchModels(
    _query: string,
    _options?: SearchOptions,
  ): Promise<AvailableModel[]> {
    // Ollama library search requires web scraping or a third-party API.
    // Return empty - callers should use a pre-built model catalog.
    return [];
  }

  async *pullModel(
    modelId: string,
    options?: PullOptions,
  ): AsyncGenerator<PullProgress, void, unknown> {
    const controller = new AbortController();

    // Wire up external abort signal
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const response = await this.fetch('/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      yield {
        status: 'error',
        progress: 0,
        error: `Pull failed: ${response.statusText}`,
      };
      return;
    }

    if (!response.body) {
      yield {
        status: 'error',
        progress: 0,
        error: 'No response body for streaming',
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastProgress = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const data = JSON.parse(line) as OllamaPullResponse;
          const progress = this.parseProgress(data);

          // Only yield if progress changed
          if (progress.progress !== lastProgress || progress.status === 'complete' || progress.status === 'error') {
            lastProgress = progress.progress;
            yield progress;
          }

          if (progress.status === 'complete' || progress.status === 'error') {
            return;
          }
        }
      }

      // Final completion
      yield { status: 'complete', progress: 100 };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        yield { status: 'error', progress: lastProgress, error: 'Download cancelled' };
      } else {
        yield {
          status: 'error',
          progress: lastProgress,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  }

  private parseProgress(data: OllamaPullResponse): PullProgress {
    const status = data.status.toLowerCase();

    // Check for completion
    if (status === 'success' || status.includes('success')) {
      return { status: 'complete', progress: 100 };
    }

    // Check for known phases
    if (status.includes('pulling')) {
      const progress = data.total && data.completed
        ? Math.round((data.completed / data.total) * 100)
        : 0;
      return {
        status: 'downloading',
        progress,
        downloadedBytes: data.completed,
        totalBytes: data.total,
        message: data.status,
      };
    }

    if (status.includes('verifying') || status.includes('digest')) {
      return { status: 'verifying', progress: 95, message: data.status };
    }

    if (status.includes('extracting') || status.includes('writing')) {
      return { status: 'extracting', progress: 98, message: data.status };
    }

    // Default to downloading for unknown status
    return {
      status: 'downloading',
      progress: data.total && data.completed
        ? Math.round((data.completed / data.total) * 100)
        : 0,
      message: data.status,
    };
  }

  async removeModel(modelId: string): Promise<void> {
    const response = await this.fetch('/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to remove model: ${text || response.statusText}`);
    }
  }

  async isModelInstalled(modelId: string): Promise<boolean> {
    const models = await this.getInstalledModels();
    return models.some((m) => m.id === modelId);
  }

  async getModelInfo(modelId: string): Promise<ModelInfo | null> {
    // First check if installed
    const installed = await this.getInstalledModels();
    const model = installed.find((m) => m.id === modelId);

    if (!model) {
      return null;
    }

    // Get detailed info via /api/show
    try {
      const response = await this.fetch('/api/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId }),
      });

      if (!response.ok) {
        // Model exists but show failed - return basic info
        return { model };
      }

      const data = (await response.json()) as OllamaShowResponse;

      return {
        model,
        license: data.license,
        architecture: data.details?.family,
        parameters: data.details?.parameter_size,
        quantization: data.details?.quantization_level,
        template: data.template,
        system: data.system,
        families: data.details?.families,
      };
    } catch {
      // Show API failed - return basic model info
      return { model };
    }
  }
}

/**
 * Create an Ollama model manager instance.
 */
export function createOllamaManager(
  config?: OllamaManagerConfig,
): OllamaModelManager {
  return new OllamaModelManager(config);
}
