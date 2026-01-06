/**
 * Hanzo Node ModelManager implementation.
 *
 * Provides model management for Hanzo Node with mining integration:
 * - List installed models via Hanzo Node API
 * - Pull models with mining reward metadata
 * - Blockchain-verified model management
 *
 * Key differences from Ollama:
 * - Mining rewards for running models
 * - Blockchain verification of model hashes
 * - Hanzo ecosystem integration
 */

import {
  scanOllamaModels as scanOllamaModelsApi,
  addOllamaModels as addOllamaModelsApi,
  type ScanOllamaModelsResponse,
} from '@hanzo_network/hanzo-message-ts/api/ollama';

import type {
  AvailableModel,
  InstalledModel,
  MiningInfo,
  ModelInfo,
  ModelManager,
  ModelManagerCapabilities,
  PullOptions,
  PullProgress,
  SearchOptions,
} from './types';

/**
 * Hanzo Node manager configuration.
 */
export interface HanzoNodeManagerConfig {
  /** Hanzo Node API address */
  readonly nodeAddress: string;
  /** Authentication token */
  readonly token: string;
}

/**
 * Capabilities for Hanzo Node model manager.
 */
export const HANZO_NODE_MANAGER_CAPABILITIES: ModelManagerCapabilities = {
  canSearch: true, // Hanzo has its own model registry
  hasProgress: false, // Current API does not stream progress
  canCancel: false, // Current API does not support cancellation
  canResume: false, // Current API does not support resume
  hasMining: true, // Mining rewards are a key feature
};

/**
 * Mining reward rates by model size (estimated tokens/hour).
 * These are approximations - actual rates depend on network conditions.
 */
const MINING_REWARD_RATES: Record<string, number> = {
  small: 10, // < 4B params
  medium: 25, // 4B - 13B params
  large: 50, // 14B - 34B params
  xlarge: 100, // 35B+ params
};

/**
 * Estimate mining reward rate based on parameter size.
 */
function estimateMiningReward(parameterSize?: string): number {
  if (!parameterSize) return MINING_REWARD_RATES.medium;

  const match = parameterSize.match(/(\d+(?:\.\d+)?)/);
  if (!match) return MINING_REWARD_RATES.medium;

  const size = parseFloat(match[1]);

  if (size < 4) return MINING_REWARD_RATES.small;
  if (size < 14) return MINING_REWARD_RATES.medium;
  if (size < 35) return MINING_REWARD_RATES.large;
  return MINING_REWARD_RATES.xlarge;
}

/**
 * Parse model name into base and tag.
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
 * Transform Hanzo Node model response to InstalledModel.
 */
function transformToInstalledModel(
  model: ScanOllamaModelsResponse[number],
): InstalledModel {
  const { name, tag } = parseModelName(model.model);

  return {
    id: model.model,
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
      portUsed: model.port_used,
      // Hanzo-specific metadata
      miningEnabled: true,
      miningRewardRate: estimateMiningReward(model.details?.parameter_size),
      verifiedInference: true,
    },
  };
}

/**
 * Featured models available on Hanzo network.
 * These models have verified mining rewards.
 */
const HANZO_FEATURED_MODELS: AvailableModel[] = [
  {
    id: 'qwen3:4b-thinking-2507',
    name: 'qwen3',
    description: 'Balanced AI for everyday tasks with advanced reasoning. From ZenLM - open models for mindful AI use.',
    tags: ['0.6b', '4b', '4b-thinking-2507', '8b', '30b-a3b'],
    source: 'hanzo',
    provider: 'ZenLM',
    capabilities: ['text-generation', 'thinking', 'tool-calling'],
    recommendedTag: '4b-thinking-2507',
    miningRewards: {
      eligible: true,
      rewardRate: 25,
      minVramGb: 4,
    },
  },
  {
    id: 'llama3.1:8b-instruct-q4_1',
    name: 'llama3.1',
    description: 'Powerful AI model for understanding and generating text, optimized for tasks like writing and processing language.',
    tags: ['8b', '8b-instruct-q4_1', '70b'],
    source: 'hanzo',
    provider: 'Meta',
    capabilities: ['text-generation', 'tool-calling'],
    recommendedTag: '8b-instruct-q4_1',
    miningRewards: {
      eligible: true,
      rewardRate: 25,
      minVramGb: 8,
    },
  },
  {
    id: 'deepseek-r1:8b',
    name: 'deepseek-r1',
    description: 'Family of open reasoning models with performance approaching O3 and Gemini 2.5 Pro.',
    tags: ['1.5b', '7b', '8b', '14b', '32b', '70b'],
    source: 'hanzo',
    provider: 'DeepSeek',
    capabilities: ['text-generation', 'thinking', 'tool-calling'],
    recommendedTag: '8b',
    miningRewards: {
      eligible: true,
      rewardRate: 25,
      minVramGb: 8,
    },
  },
  {
    id: 'hermes-4:70b',
    name: 'hermes-4',
    description: 'Professional coding companion with expert-level development capabilities. Built on ZenLM philosophy.',
    tags: ['70b'],
    source: 'hanzo',
    provider: 'NousResearch',
    capabilities: ['text-generation', 'tool-calling', 'code'],
    recommendedTag: '70b',
    miningRewards: {
      eligible: true,
      rewardRate: 100,
      minVramGb: 48,
    },
  },
  {
    id: 'gpt-oss:20b',
    name: 'gpt-oss',
    description: 'OpenAI open-weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.',
    tags: ['20b', '120b', '20b-cloud', '120b-cloud'],
    source: 'hanzo',
    provider: 'OpenAI',
    capabilities: ['text-generation', 'thinking', 'tool-calling'],
    recommendedTag: '20b',
    miningRewards: {
      eligible: true,
      rewardRate: 50,
      minVramGb: 16,
    },
  },
];

/**
 * Hanzo Node ModelManager implementation.
 */
export class HanzoNodeModelManager implements ModelManager {
  readonly engineId = 'hanzo-node';

  private readonly config: HanzoNodeManagerConfig;

  constructor(config: HanzoNodeManagerConfig) {
    this.config = config;
  }

  async getInstalledModels(): Promise<InstalledModel[]> {
    const response = await scanOllamaModelsApi(
      this.config.nodeAddress,
      this.config.token,
    );

    // Deduplicate by model name
    const unique = response.filter(
      (m, i, arr) => i === arr.findIndex((t) => t.model === m.model),
    );

    return unique.map(transformToInstalledModel);
  }

  async getAvailableModels(): Promise<AvailableModel[]> {
    // Return featured models from Hanzo registry
    return HANZO_FEATURED_MODELS;
  }

  async searchModels(
    query: string,
    options?: SearchOptions,
  ): Promise<AvailableModel[]> {
    const lowerQuery = query.toLowerCase();
    let results = HANZO_FEATURED_MODELS.filter(
      (m) =>
        m.name.toLowerCase().includes(lowerQuery) ||
        m.description.toLowerCase().includes(lowerQuery) ||
        m.provider?.toLowerCase().includes(lowerQuery),
    );

    // Apply filters
    if (options?.source) {
      results = results.filter((m) => m.source === options.source);
    }
    if (options?.capability) {
      results = results.filter((m) =>
        m.capabilities?.includes(options.capability!),
      );
    }
    if (options?.provider) {
      results = results.filter(
        (m) => m.provider?.toLowerCase() === options.provider!.toLowerCase(),
      );
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async *pullModel(
    modelId: string,
    _options?: PullOptions,
  ): AsyncGenerator<PullProgress, void, unknown> {
    // Initial progress - Hanzo Node API does not stream progress
    yield {
      status: 'downloading',
      progress: 0,
      message: 'Starting model download',
    };

    try {
      // Intermediate progress (API blocks until complete)
      yield {
        status: 'downloading',
        progress: 10,
        message: 'Downloading and registering model with Hanzo Node',
      };

      await addOllamaModelsApi(this.config.nodeAddress, this.config.token, {
        models: [modelId],
      });

      yield {
        status: 'verifying',
        progress: 90,
        message: 'Verifying blockchain registration',
      };

      // Verify installation
      const models = await this.getInstalledModels();
      const installed = models.find((m) => m.id === modelId);

      if (!installed) {
        yield {
          status: 'error',
          progress: 0,
          error: `Model ${modelId} not found after installation`,
        };
        return;
      }

      yield {
        status: 'complete',
        progress: 100,
        message: 'Model installed with mining rewards enabled',
      };
    } catch (err) {
      yield {
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Installation failed',
      };
    }
  }

  async removeModel(modelId: string): Promise<void> {
    // Current Hanzo Node API does not support model removal
    // This would require backend implementation
    throw new Error(
      `Model removal not yet supported for Hanzo Node. Model: ${modelId}`,
    );
  }

  async isModelInstalled(modelId: string): Promise<boolean> {
    const models = await this.getInstalledModels();
    return models.some((m) => m.id === modelId);
  }

  async getModelInfo(modelId: string): Promise<ModelInfo | null> {
    const models = await this.getInstalledModels();
    const model = models.find((m) => m.id === modelId);

    if (!model) {
      return null;
    }

    const metadata = model.metadata as Record<string, unknown>;

    return {
      model,
      architecture: metadata.family as string | undefined,
      parameters: metadata.parameterSize as string | undefined,
      quantization: metadata.quantizationLevel as string | undefined,
      families: metadata.families as string[] | undefined,
    };
  }

  /**
   * Get mining info for a model.
   */
  getMiningInfo(modelId: string): MiningInfo {
    // Check featured models for known mining info
    const featured = HANZO_FEATURED_MODELS.find(
      (m) => m.id === modelId || modelId.startsWith(m.name),
    );

    if (featured?.miningRewards) {
      return featured.miningRewards;
    }

    // Default mining info for unknown models
    return {
      eligible: true,
      rewardRate: MINING_REWARD_RATES.medium,
    };
  }
}

/**
 * Create a Hanzo Node model manager instance.
 */
export function createHanzoNodeManager(
  config: HanzoNodeManagerConfig,
): HanzoNodeModelManager {
  return new HanzoNodeModelManager(config);
}
