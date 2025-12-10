/**
 * Hanzo Node Sidecar Engine.
 *
 * Blockchain-integrated AI with mining rewards.
 * Manages models via Hanzo Node API (proxies to Ollama).
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
 * Hanzo Node connection configuration.
 */
export interface HanzoNodeConfig {
  /** Node API address (e.g., http://127.0.0.1:9550) */
  readonly nodeAddress: string;
  /** Authentication token */
  readonly token: string;
  /** Default model to use */
  readonly defaultModel?: string;
}

/**
 * Hanzo-specific model metadata.
 */
export interface HanzoModelMetadata extends Record<string, unknown> {
  readonly miningEnabled: boolean;
  readonly verifiedInference: boolean;
  readonly ollamaPort?: string;
  readonly digest?: string;
  readonly family?: string;
}

/**
 * Hanzo Node model response from API.
 */
interface HanzoModelResponse {
  model: string;
  size: number;
  digest: string;
  modified_at: string;
  port_used?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    parent_model?: string;
  };
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
function inferCapabilities(model: HanzoModelResponse): ModelCapability[] {
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
 * Transform Hanzo model to InstalledModel.
 */
function transformModel(model: HanzoModelResponse): InstalledModel {
  const { name, tag } = parseModelString(model.model);
  const paramSize = model.details?.parameter_size;
  const family = model.details?.family;

  const metadata: HanzoModelMetadata = {
    miningEnabled: true,
    verifiedInference: true,
    ollamaPort: model.port_used,
    digest: model.digest,
    family,
  };

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
    metadata,
  };
}

/**
 * Hanzo Node Sidecar Engine.
 */
export class HanzoNodeSidecar
  extends OpenAICompatibleEngine
  implements SidecarEngine, ModelManager
{
  private readonly nodeAddress: string;
  private readonly authToken: string;

  constructor(config: HanzoNodeConfig) {
    const engineConfig: EngineConfig = {
      id: 'hanzo-node',
      name: 'Hanzo Node',
      baseUrl: `${config.nodeAddress}/v1`,
      apiKey: config.token,
      defaultModel: config.defaultModel,
    };

    super(engineConfig);
    this.nodeAddress = config.nodeAddress;
    this.authToken = config.token;
  }

  private async nodeRequest<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.nodeAddress}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // --- SidecarEngine interface ---

  async start(): Promise<Result<void>> {
    // Hanzo Node lifecycle managed via Tauri sidecar API
    return { ok: true, value: undefined };
  }

  async stop(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async restart(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async isRunning(): Promise<boolean> {
    try {
      await this.nodeRequest('/v2/health');
      return true;
    } catch {
      return false;
    }
  }

  async getHealth(): Promise<SidecarHealth> {
    try {
      const health = await this.nodeRequest<{
        status: string;
        version?: string;
      }>('/v2/health');

      return {
        running: health.status === 'ok',
        version: health.version,
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
      status: 'Starting installation',
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 0,
    };

    try {
      yield {
        modelId: name,
        status: 'Downloading and registering model',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 10,
      };

      // Use Hanzo Node API to add model (proxies to Ollama)
      await this.nodeRequest('/v2/add_ollama_models', {
        method: 'POST',
        body: JSON.stringify({ models: [name] }),
      });

      yield {
        modelId: name,
        status: 'Verifying installation',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 90,
      };

      // Verify installation
      const installed = await this.getInstalledModels();
      if (!installed.ok) {
        return { ok: false, error: installed.error };
      }

      const model = installed.value.find((m) => m.id === name);
      if (!model) {
        return { ok: false, error: `Model ${name} not found after installation` };
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
    // Model removal not yet implemented in Hanzo Node API
    return {
      ok: false,
      error: `Model removal not yet supported. Model: ${name}`,
    };
  }

  async getInstalledModels(): Promise<Result<InstalledModel[]>> {
    try {
      const models = await this.nodeRequest<HanzoModelResponse[]>(
        '/v2/scan_ollama_models',
      );

      // Deduplicate by model name
      const unique = models.filter(
        (m, i, arr) => i === arr.findIndex((t) => t.model === m.model),
      );

      return { ok: true, value: unique.map(transformModel) };
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
 * Create a Hanzo Node sidecar engine.
 */
export function createHanzoNode(config: HanzoNodeConfig): HanzoNodeSidecar {
  return new HanzoNodeSidecar(config);
}

/**
 * Hanzo Node benefits for UI display.
 */
export const HANZO_NODE_BENEFITS = {
  mining: {
    title: 'Earn AI Coin',
    description: 'Earn rewards by running models on Hanzo Node',
    icon: 'coin',
  },
  verification: {
    title: 'Blockchain Verified',
    description: 'All inference is cryptographically verified on-chain',
    icon: 'shield-check',
  },
  ecosystem: {
    title: 'Hanzo Ecosystem',
    description: 'Seamless integration with Hanzo tools and services',
    icon: 'puzzle',
  },
} as const;
