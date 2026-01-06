/**
 * Hanzo Node adapter for the engine-agnostic local AI system.
 *
 * Design:
 * - Implements EngineAdapter interface for Hanzo Node
 * - Uses existing Hanzo Node APIs (scanOllamaModels, addOllamaModels)
 * - Includes blockchain/mining metadata for on-chain integration
 * - Transforms Hanzo Node responses to unified LocalAIModel format
 *
 * Hanzo Node benefits:
 * - Earn AI coin by running models (mining rewards)
 * - Blockchain-verified inference
 * - Integrated with Hanzo ecosystem
 * - Preferred/recommended engine
 */

import {
  scanOllamaModels as scanOllamaModelsApi,
  addOllamaModels as addOllamaModelsApi,
  type ScanOllamaModelsResponse,
} from '@hanzo_network/hanzo-message-ts/api/ollama';

import {
  type EngineAdapter,
  type EngineResult,
  type EngineStatus,
  type InstallProgress,
  type LocalAIModel,
  LocalAIEngine,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,
} from '../types';

/**
 * Hanzo Node connection configuration.
 */
export interface HanzoNodeConfig {
  /** Node API address (e.g., "http://127.0.0.1:9550") */
  readonly nodeAddress: string;
  /** Authentication token */
  readonly token: string;
}

/**
 * Hanzo-specific model metadata for blockchain integration.
 */
export interface HanzoModelMetadata {
  /** Whether this model supports mining rewards */
  readonly miningEnabled: boolean;
  /** Estimated mining reward rate (AI coin per hour) */
  readonly miningRewardRate?: number;
  /** Whether inference is blockchain-verified */
  readonly verifiedInference: boolean;
  /** Port used by Ollama backend */
  readonly ollamaPort?: string;
  /** Model digest/hash for verification */
  readonly digest?: string;
  /** Model family (e.g., "llama", "qwen") */
  readonly family?: string;
  /** Quantization level from Ollama */
  readonly quantizationLevel?: string;
  /** Parameter size string (e.g., "8B", "70B") */
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
 * Create a unique model ID for Hanzo Node models.
 */
function createModelId(model: string): string {
  return `${LocalAIEngine.HanzoNode}:${model}`;
}

/**
 * Parse model name and tag from full model string.
 * Handles formats like "llama3.1:8b-instruct-q4_1" or "qwen3:4b".
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
 * Infer model capabilities from model metadata.
 */
function inferCapabilities(
  model: ScanOllamaModelsResponse[number],
): ModelCapability[] {
  const capabilities: ModelCapability[] = [ModelCapability.TextGeneration];

  const families = model.details?.families ?? [];
  const modelName = model.model.toLowerCase();

  // Vision models
  if (
    families.includes('clip') ||
    modelName.includes('vision') ||
    modelName.includes('llava')
  ) {
    capabilities.push(ModelCapability.Vision);
  }

  // Thinking/reasoning models
  if (
    modelName.includes('think') ||
    modelName.includes('r1') ||
    modelName.includes('reasoning')
  ) {
    capabilities.push(ModelCapability.Thinking);
  }

  // Tool calling (most modern models support this)
  if (
    modelName.includes('instruct') ||
    modelName.includes('chat') ||
    families.includes('llama') ||
    families.includes('qwen')
  ) {
    capabilities.push(ModelCapability.ToolCalling);
  }

  // Code models
  if (
    modelName.includes('code') ||
    modelName.includes('coder') ||
    modelName.includes('starcoder') ||
    modelName.includes('deepseek')
  ) {
    capabilities.push(ModelCapability.Code);
  }

  return capabilities;
}

/**
 * Infer model quality from parameter count.
 */
function inferQuality(parameterSize?: string): ModelQuality {
  if (!parameterSize) return ModelQuality.Medium;

  const sizeMatch = parameterSize.match(/(\d+(?:\.\d+)?)/);
  if (!sizeMatch) return ModelQuality.Medium;

  const size = parseFloat(sizeMatch[1]);
  const unit = parameterSize.toLowerCase();

  // Convert to billions for comparison
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
 * Infer model speed from parameter count (inverse of quality).
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
  // Default context lengths by family
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

  // Check model name for hints
  if (modelName) {
    const lower = modelName.toLowerCase();
    if (lower.includes('128k') || lower.includes('128000')) return 128000;
    if (lower.includes('32k') || lower.includes('32000')) return 32000;
    if (lower.includes('16k') || lower.includes('16000')) return 16000;
    if (lower.includes('8k') || lower.includes('8000')) return 8192;
  }

  return 4096; // Conservative default
}

/**
 * Create display name from model string.
 */
function createDisplayName(model: string, parameterSize?: string): string {
  const { name, tag } = parseModelString(model);

  // Capitalize first letter of each word
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
 * Transform Hanzo Node Ollama model response to unified LocalAIModel.
 */
function transformToLocalAIModel(
  model: ScanOllamaModelsResponse[number],
): LocalAIModel {
  const { name, tag } = parseModelString(model.model);
  const parameterSize = model.details?.parameter_size;
  const family = model.details?.family;

  const metadata: Record<string, unknown> = {
    miningEnabled: true, // All Hanzo Node models support mining
    verifiedInference: true, // All inference is verified
    ollamaPort: model.port_used,
    digest: model.digest,
    family,
    quantizationLevel: model.details?.quantization_level,
    parameterSize,
  } satisfies HanzoModelMetadata;

  return {
    id: createModelId(model.model),
    name,
    tag,
    displayName: createDisplayName(model.model, parameterSize),
    description: `${family || name} model running on Hanzo Node with blockchain verification`,
    engine: LocalAIEngine.HanzoNode,
    capabilities: inferCapabilities(model),
    sizeBytes: model.size,
    contextLength: inferContextLength(family, model.model),
    quality: inferQuality(parameterSize),
    speed: inferSpeed(parameterSize),
    status: ModelStatus.Installed,
    provider: family
      ? family.charAt(0).toUpperCase() + family.slice(1)
      : undefined,
    parameters: parameterSize,
    quantization: model.details?.quantization_level,
    metadata,
  };
}

/**
 * Hanzo Node adapter implementation.
 *
 * Provides model management through Hanzo Node's Ollama integration,
 * with additional blockchain/mining metadata.
 */
export class HanzoNodeAdapter implements EngineAdapter {
  readonly engine = LocalAIEngine.HanzoNode;

  private readonly config: HanzoNodeConfig;

  constructor(config: HanzoNodeConfig) {
    this.config = config;
  }

  /**
   * Check Hanzo Node status.
   * Attempts to connect and verify the node is responsive.
   */
  async getStatus(): Promise<EngineResult<EngineStatus>> {
    try {
      // Try to scan models as a health check
      await scanOllamaModelsApi(this.config.nodeAddress, this.config.token);

      return {
        success: true,
        data: {
          engine: LocalAIEngine.HanzoNode,
          available: true,
          running: true,
          apiUrl: this.config.nodeAddress,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Hanzo Node unavailable: ${errorMessage}`,
      };
    }
  }

  /**
   * Scan for installed models on Hanzo Node.
   */
  async scanModels(): Promise<EngineResult<LocalAIModel[]>> {
    try {
      const response = await scanOllamaModelsApi(
        this.config.nodeAddress,
        this.config.token,
      );

      // Deduplicate models by name
      const uniqueModels = response.filter(
        (model, index, self) =>
          index === self.findIndex((t) => t.model === model.model),
      );

      const models = uniqueModels.map(transformToLocalAIModel);

      return { success: true, data: models };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to scan models: ${errorMessage}`,
      };
    }
  }

  /**
   * Install a model on Hanzo Node.
   *
   * Uses Hanzo Node's addOllamaModels API which handles downloading
   * and registering the model. Progress is estimated since the API
   * does not provide streaming progress.
   */
  async *installModel(
    modelName: string,
    tag: string,
  ): AsyncGenerator<InstallProgress, EngineResult<LocalAIModel>, unknown> {
    const fullModel = `${modelName}:${tag}`;
    const modelId = createModelId(fullModel);

    // Initial progress
    yield {
      modelId,
      status: 'Starting installation',
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 0,
    };

    try {
      // Yield progress before API call (API blocks until complete)
      yield {
        modelId,
        status: 'Downloading and registering model',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 10,
      };

      // Add the model via Hanzo Node API
      await addOllamaModelsApi(this.config.nodeAddress, this.config.token, {
        models: [fullModel],
      });

      yield {
        modelId,
        status: 'Verifying installation',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 90,
      };

      // Verify installation by scanning
      const scanResult = await this.scanModels();
      if (!scanResult.success) {
        return {
          success: false,
          error: `Installation may have succeeded but verification failed: ${scanResult.error}`,
        };
      }

      const installedModel = scanResult.data.find((m) => m.id === modelId);
      if (!installedModel) {
        return {
          success: false,
          error: `Model ${fullModel} not found after installation`,
        };
      }

      yield {
        modelId,
        status: 'Complete',
        downloadedBytes: installedModel.sizeBytes,
        totalBytes: installedModel.sizeBytes,
        percent: 100,
      };

      return { success: true, data: installedModel };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to install model: ${errorMessage}`,
      };
    }
  }

  /**
   * Remove a model from Hanzo Node.
   *
   * Note: The current Hanzo Node API does not expose model removal.
   * This would need to be added to the backend.
   */
  async removeModel(modelId: string): Promise<EngineResult<void>> {
    // Extract model name from ID (format: "hanzo-node:model:tag")
    const modelPart = modelId.replace(`${LocalAIEngine.HanzoNode}:`, '');

    // TODO: Implement when backend supports model removal
    // For now, return error indicating unsupported operation
    return {
      success: false,
      error: `Model removal not yet supported for Hanzo Node. Model: ${modelPart}`,
    };
  }

  /**
   * Get a specific model by ID.
   */
  async getModel(modelId: string): Promise<EngineResult<LocalAIModel | null>> {
    const scanResult = await this.scanModels();
    if (!scanResult.success) {
      return { success: false, error: scanResult.error };
    }

    const model = scanResult.data.find((m) => m.id === modelId) ?? null;
    return { success: true, data: model };
  }

  /**
   * Check if a model is installed.
   */
  async isModelInstalled(modelName: string, tag: string): Promise<boolean> {
    const modelId = createModelId(`${modelName}:${tag}`);
    const result = await this.getModel(modelId);
    return result.success && result.data !== null;
  }
}

/**
 * Create a Hanzo Node adapter instance.
 */
export function createHanzoNodeAdapter(
  config: HanzoNodeConfig,
): HanzoNodeAdapter {
  return new HanzoNodeAdapter(config);
}

/**
 * Engine metadata for Hanzo Node.
 * Used by UI to display engine information and benefits.
 */
export const HANZO_NODE_ENGINE_INFO = {
  engine: LocalAIEngine.HanzoNode,
  name: 'Hanzo Node',
  description:
    'Run AI models locally with blockchain verification and mining rewards',
  isRecommended: true,
  isDefault: true,
  benefits: Object.values(HANZO_NODE_BENEFITS),
  setupUrl: 'https://docs.hanzo.ai/node/setup',
  logoUrl: '/images/hanzo-node-logo.svg',
} as const;
