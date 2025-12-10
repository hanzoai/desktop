/**
 * Ollama Sidecar Engine.
 *
 * Manages Ollama as a sidecar process with model management.
 * Communicates via OpenAI-compatible API on port 11434.
 */

import {
  OpenAICompatibleEngine,
  type EngineConfig,
  type Model,
  type Result,
} from '../types';
import type {
  InstalledModel,
  ModelManager,
  PullProgress,
  SidecarEngine,
  SidecarHealth,
} from './types';
import {
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,
} from './types';

/**
 * Ollama connection configuration.
 */
export interface OllamaConfig {
  /** Ollama API base URL (default: http://127.0.0.1:11434) */
  readonly baseUrl?: string;
  /** Default model to use */
  readonly defaultModel?: string;
}

/**
 * Ollama API response types.
 */
interface OllamaModel {
  model: string;
  name?: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    parent_model?: string;
  };
}

interface OllamaPullResponse {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/**
 * Parse model name and tag.
 */
function parseModelString(model: string): { name: string; tag: string } {
  const idx = model.indexOf(':');
  return idx === -1
    ? { name: model, tag: 'latest' }
    : { name: model.slice(0, idx), tag: model.slice(idx + 1) };
}

/**
 * Infer capabilities from model metadata.
 */
function inferCapabilities(model: OllamaModel): ModelCapability[] {
  const caps: ModelCapability[] = [ModelCapability.TextGeneration];
  const families = model.details?.families ?? [];
  const name = model.model.toLowerCase();

  if (families.includes('clip') || name.includes('vision') || name.includes('llava')) {
    caps.push(ModelCapability.Vision);
  }
  if (name.includes('think') || name.includes('r1') || name.includes('reasoning')) {
    caps.push(ModelCapability.Thinking);
  }
  if (families.includes('llama') || families.includes('qwen') || name.includes('instruct')) {
    caps.push(ModelCapability.ToolCalling);
  }
  if (name.includes('code') || name.includes('coder') || name.includes('deepseek')) {
    caps.push(ModelCapability.Code);
  }

  return caps;
}

/**
 * Infer quality from parameter size.
 */
function inferQuality(params?: string): ModelQuality {
  if (!params) return ModelQuality.Medium;
  const match = params.match(/(\d+(?:\.\d+)?)/);
  if (!match) return ModelQuality.Medium;

  const size = parseFloat(match[1]);
  if (size >= 70) return ModelQuality.Excellent;
  if (size >= 30) return ModelQuality.Good;
  if (size >= 7) return ModelQuality.Medium;
  return ModelQuality.Low;
}

/**
 * Infer speed from parameter size.
 */
function inferSpeed(params?: string): ModelSpeed {
  if (!params) return ModelSpeed.Average;
  const match = params.match(/(\d+(?:\.\d+)?)/);
  if (!match) return ModelSpeed.Average;

  const size = parseFloat(match[1]);
  if (size < 2) return ModelSpeed.VeryFast;
  if (size < 8) return ModelSpeed.Fast;
  if (size < 30) return ModelSpeed.Average;
  return ModelSpeed.Slow;
}

/**
 * Infer context length from family.
 */
function inferContextLength(family?: string): number {
  const lengths: Record<string, number> = {
    llama: 128000,
    qwen: 128000,
    mistral: 32000,
    phi: 16000,
    gemma: 8192,
    deepseek: 128000,
  };
  return family ? (lengths[family.toLowerCase()] ?? 4096) : 4096;
}

/**
 * Transform Ollama model to InstalledModel.
 */
function transformModel(model: OllamaModel): InstalledModel {
  const { name, tag } = parseModelString(model.model);
  const paramSize = model.details?.parameter_size;
  const family = model.details?.family;

  return {
    id: model.model,
    name,
    tag,
    sizeBytes: model.size,
    contextLength: inferContextLength(family),
    capabilities: inferCapabilities(model),
    quality: inferQuality(paramSize),
    speed: inferSpeed(paramSize),
    status: ModelStatus.Installed,
    provider: family ? family.charAt(0).toUpperCase() + family.slice(1) : undefined,
    parameters: paramSize,
    quantization: model.details?.quantization_level,
    metadata: {
      digest: model.digest,
      modifiedAt: model.modified_at,
      family,
      format: model.details?.format,
    },
  };
}

/**
 * Ollama Sidecar Engine.
 */
export class OllamaSidecar
  extends OpenAICompatibleEngine
  implements SidecarEngine, ModelManager
{
  private readonly ollamaBaseUrl: string;

  constructor(config: OllamaConfig = {}) {
    const baseUrl = config.baseUrl ?? 'http://127.0.0.1:11434';

    const engineConfig: EngineConfig = {
      id: 'ollama',
      name: 'Ollama',
      baseUrl: `${baseUrl}/v1`,
      defaultModel: config.defaultModel,
    };

    super(engineConfig);
    this.ollamaBaseUrl = baseUrl;
  }

  // --- SidecarEngine interface ---

  async start(): Promise<Result<void>> {
    // Ollama manages its own lifecycle via launchd/systemd
    // For manual control, use Tauri sidecar API
    return { ok: true, value: undefined };
  }

  async stop(): Promise<Result<void>> {
    // Ollama manages its own lifecycle
    return { ok: true, value: undefined };
  }

  async restart(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/version`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getHealth(): Promise<SidecarHealth> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/version`);
      if (!response.ok) {
        return { running: false, error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      return {
        running: true,
        version: data.version,
      };
    } catch (error) {
      return {
        running: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // --- ModelManager interface ---

  async *pullModel(
    name: string,
  ): AsyncGenerator<PullProgress, Result<InstalledModel>, unknown> {
    yield {
      modelId: name,
      status: 'Starting download',
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 0,
    };

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { ok: false, error: 'No response body' };
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data: OllamaPullResponse = JSON.parse(line);
            const total = data.total ?? 0;
            const completed = data.completed ?? 0;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            yield {
              modelId: name,
              status: data.status,
              downloadedBytes: completed,
              totalBytes: total,
              percent,
            };
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Verify installation
      const installed = await this.getInstalledModels();
      if (!installed.ok) {
        return { ok: false, error: installed.error };
      }

      const model = installed.value.find((m) => m.id === name);
      if (!model) {
        return { ok: false, error: `Model ${name} not found after pull` };
      }

      yield {
        modelId: name,
        status: 'Complete',
        downloadedBytes: model.sizeBytes,
        totalBytes: model.sizeBytes,
        percent: 100,
      };

      return { ok: true, value: model };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async removeModel(name: string): Promise<Result<void>> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getInstalledModels(): Promise<Result<InstalledModel[]>> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`);
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      const models: InstalledModel[] = (data.models ?? []).map(transformModel);
      return { ok: true, value: models };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async isModelInstalled(name: string): Promise<boolean> {
    const result = await this.getInstalledModels();
    if (!result.ok) return false;
    return result.value.some((m) => m.id === name || m.name === name);
  }

  // Override listModels to return installed models
  override async listModels(): Promise<Model[]> {
    const result = await this.getInstalledModels();
    if (!result.ok) return [];
    return result.value.map((m) => ({
      id: m.id,
      name: m.name,
      ownedBy: m.provider,
    }));
  }
}

/**
 * Create an Ollama sidecar engine.
 */
export function createOllama(config: OllamaConfig = {}): OllamaSidecar {
  return new OllamaSidecar(config);
}
