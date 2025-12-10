/**
 * Hanzo Node Model Manager implementation.
 *
 * Provides model management for Hanzo Node with blockchain integration.
 * All models running on Hanzo Node support mining rewards and verified inference.
 *
 * Design:
 * - Implements ModelManager interface
 * - Adds blockchain-specific metadata (mining, verification)
 * - Uses Hanzo Node API for model operations
 */

import {
  scanOllamaModels as scanOllamaModelsApi,
  addOllamaModels as addOllamaModelsApi,
  type ScanOllamaModelsResponse,
} from '@hanzo_network/hanzo-message-ts/api/ollama';

import {
  type AIEngine,
  type AvailableModel,
  type InstalledModel,
  type ModelManager,
  type PullProgress,
  type Result,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,
} from '../types';
import { OpenAIEngine, type OpenAIEngineConfig } from './openai-engine';

/**
 * Hanzo Node connection configuration.
 */
export interface HanzoNodeConnection {
  /** Node API address */
  readonly nodeAddress: string;
  /** Authentication token */
  readonly token: string;
}

/**
 * Hanzo-specific model metadata.
 */
export interface HanzoModelMetadata extends Record<string, unknown> {
  readonly miningEnabled: boolean;
  readonly miningRewardRate?: number;
  readonly verifiedInference: boolean;
  readonly ollamaPort?: string;
  readonly digest?: string;
  readonly family?: string;
  readonly quantizationLevel?: string;
  readonly parameterSize?: string;
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

/**
 * Engine metadata for Hanzo Node.
 */
export const HANZO_NODE_ENGINE_INFO = {
  id: 'hanzo-node',
  name: 'Hanzo Node',
  description: 'Run AI models locally with blockchain verification and mining rewards',
  isRecommended: true,
  isDefault: true,
  benefits: Object.values(HANZO_NODE_BENEFITS),
  setupUrl: 'https://docs.hanzo.ai/node/setup',
  logoUrl: '/images/hanzo-node-logo.svg',
} as const;

/**
 * Parse model name and tag from full model string.
 */
function parseModelString(modelString: string): { name: string; tag: string } {
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) {
    return { name: modelString, tag: 'latest' };
  }
  return {
    name: modelString.substring(0, colonIndex),
    tag: modelString.substring(colonIndex + 1),
  };
}

/**
 * Infer capabilities from model metadata.
 */
function inferCapabilities(model: ScanOllamaModelsResponse[number]): ModelCapability[] {
  const capabilities: ModelCapability[] = [ModelCapability.TextGeneration];
  const families = model.details?.families ?? [];
  const modelName = model.model.toLowerCase();

  if (families.includes('clip') || modelName.includes('vision') || modelName.includes('llava')) {
    capabilities.push(ModelCapability.Vision);
  }
  if (modelName.includes('think') || modelName.includes('r1') || modelName.includes('reasoning')) {
    capabilities.push(ModelCapability.Thinking);
  }
  if (modelName.includes('instruct') || modelName.includes('chat') || families.includes('llama') || families.includes('qwen')) {
    capabilities.push(ModelCapability.ToolCalling);
  }
  if (modelName.includes('code') || modelName.includes('coder') || modelName.includes('starcoder') || modelName.includes('deepseek')) {
    capabilities.push(ModelCapability.Code);
  }

  return capabilities;
}

/**
 * Infer quality from parameter size.
 */
function inferQuality(parameterSize?: string): ModelQuality {
  if (!parameterSize) return ModelQuality.Medium;

  const sizeMatch = parameterSize.match(/(\d+(?:\.\d+)?)/);
  if (!sizeMatch) return ModelQuality.Medium;

  const size = parseFloat(sizeMatch[1]);
  const unit = parameterSize.toLowerCase();

  let billions = size;
  if (unit.includes('m') && !unit.includes('b')) {
    billions = size / 1000;
  }

  if (billions >= 70) return ModelQuality.Excellent;
  if (billions >= 30) return ModelQuality.Good;
  if (billions >= 7) return ModelQuality.Medium;
  return ModelQuality.Low;
}

/**
 * Infer speed from parameter size.
 */
function inferSpeed(parameterSize?: string): ModelSpeed {
  if (!parameterSize) return ModelSpeed.Average;

  const sizeMatch = parameterSize.match(/(\d+(?:\.\d+)?)/);
  if (!sizeMatch) return ModelSpeed.Average;

  const size = parseFloat(sizeMatch[1]);
  const unit = parameterSize.toLowerCase();

  let billions = size;
  if (unit.includes('m') && !unit.includes('b')) {
    billions = size / 1000;
  }

  if (billions < 2) return ModelSpeed.VeryFast;
  if (billions < 8) return ModelSpeed.Fast;
  if (billions < 30) return ModelSpeed.Average;
  return ModelSpeed.Slow;
}

/**
 * Infer context length from model family.
 */
function inferContextLength(family?: string, modelName?: string): number {
  const contextByFamily: Record<string, number> = {
    llama: 128000,
    qwen: 128000,
    mistral: 32000,
    phi: 16000,
    gemma: 8192,
    deepseek: 128000,
  };

  if (family && contextByFamily[family.toLowerCase()]) {
    return contextByFamily[family.toLowerCase()];
  }

  if (modelName) {
    const lower = modelName.toLowerCase();
    if (lower.includes('128k')) return 128000;
    if (lower.includes('32k')) return 32000;
    if (lower.includes('16k')) return 16000;
    if (lower.includes('8k')) return 8192;
  }

  return 4096;
}

/**
 * Create display name from model string.
 */
function createDisplayName(model: string, parameterSize?: string): string {
  const { name, tag } = parseModelString(model);

  const formatted = name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (parameterSize) {
    return `${formatted} (${parameterSize})`;
  }
  if (tag !== 'latest') {
    return `${formatted} ${tag}`;
  }
  return formatted;
}

/**
 * Transform Hanzo Node response to InstalledModel.
 */
function transformToInstalledModel(
  model: ScanOllamaModelsResponse[number],
): InstalledModel {
  const { name, tag } = parseModelString(model.model);
  const parameterSize = model.details?.parameter_size;
  const family = model.details?.family;

  const metadata: HanzoModelMetadata = {
    miningEnabled: true,
    verifiedInference: true,
    ollamaPort: model.port_used,
    digest: model.digest,
    family,
    quantizationLevel: model.details?.quantization_level,
    parameterSize,
  };

  return {
    id: model.model,
    name: createDisplayName(model.model, parameterSize),
    tag,
    ownedBy: family ? family.charAt(0).toUpperCase() + family.slice(1) : undefined,
    sizeBytes: model.size,
    contextLength: inferContextLength(family, model.model),
    capabilities: inferCapabilities(model),
    quality: inferQuality(parameterSize),
    speed: inferSpeed(parameterSize),
    status: ModelStatus.Installed,
    provider: family ? family.charAt(0).toUpperCase() + family.slice(1) : undefined,
    parameters: parameterSize,
    quantization: model.details?.quantization_level,
    metadata,
  };
}

/**
 * Hanzo Node AI Engine.
 *
 * OpenAI-compatible engine for Hanzo Node.
 */
export class HanzoNodeEngine extends OpenAIEngine {
  constructor(connection: HanzoNodeConnection) {
    const config: OpenAIEngineConfig = {
      id: 'hanzo-node',
      name: 'Hanzo Node',
      baseUrl: `${connection.nodeAddress}/v1`,
      apiKey: connection.token,
    };
    super(config);
  }
}

/**
 * Hanzo Node Model Manager.
 *
 * Manages models on Hanzo Node with blockchain integration.
 */
export class HanzoNodeModelManager implements ModelManager {
  readonly engine: AIEngine;

  private readonly connection: HanzoNodeConnection;

  constructor(connection: HanzoNodeConnection) {
    this.connection = connection;
    this.engine = new HanzoNodeEngine(connection);
  }

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

      await addOllamaModelsApi(this.connection.nodeAddress, this.connection.token, {
        models: [name],
      });

      yield {
        modelId: name,
        status: 'Verifying installation',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 90,
      };

      const result = await this.getInstalledModels();
      if (!result.ok) {
        return {
          ok: false,
          error: `Installation may have succeeded but verification failed: ${result.error}`,
        };
      }

      const installed = result.value.find((m) => m.id === name);
      if (!installed) {
        return { ok: false, error: `Model ${name} not found after installation` };
      }

      yield {
        modelId: name,
        status: 'Complete',
        downloadedBytes: installed.sizeBytes,
        totalBytes: installed.sizeBytes,
        percent: 100,
      };

      return { ok: true, value: installed };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: `Failed to install model: ${message}` };
    }
  }

  async removeModel(name: string): Promise<Result<void>> {
    return {
      ok: false,
      error: `Model removal not yet supported for Hanzo Node. Model: ${name}`,
    };
  }

  async getInstalledModels(): Promise<Result<readonly InstalledModel[]>> {
    try {
      const response = await scanOllamaModelsApi(
        this.connection.nodeAddress,
        this.connection.token,
      );

      // Deduplicate by model name
      const uniqueModels = response.filter(
        (model, index, self) =>
          index === self.findIndex((t) => t.model === model.model),
      );

      const models = uniqueModels.map(transformToInstalledModel);
      return { ok: true, value: models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: `Failed to scan models: ${message}` };
    }
  }

  async getAvailableModels(): Promise<Result<readonly AvailableModel[]>> {
    // Could integrate with Hanzo model registry in the future
    return { ok: true, value: [] };
  }

  async isModelInstalled(name: string): Promise<boolean> {
    const result = await this.getInstalledModels();
    if (!result.ok) return false;
    return result.value.some((m) => m.id === name);
  }
}

/**
 * Create a Hanzo Node model manager.
 */
export function createHanzoNodeModelManager(
  connection: HanzoNodeConnection,
): HanzoNodeModelManager {
  return new HanzoNodeModelManager(connection);
}

// Legacy exports for backwards compatibility
export { HanzoNodeModelManager as HanzoNodeAdapter };
export { createHanzoNodeModelManager as createHanzoNodeAdapter };
export type { HanzoNodeConnection as HanzoNodeConfig };
