/**
 * Ollama engine adapter implementation.
 *
 * Wraps Ollama API calls and transforms responses to the unified LocalAIModel format.
 * Uses the Hanzo Node API as a proxy for Ollama operations.
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
 * Model repository entry for enriching scanned models with metadata.
 */
interface OllamaModelDefinition {
  name: string;
  description: string;
  supportTools: boolean;
  defaultTag: string;
  tags: Array<{
    name: string;
    hash: string;
    size: string;
    isDefault: boolean;
  }>;
  embedding: boolean;
  vision: boolean;
  thinking?: boolean;
  cloud?: boolean;
}

/**
 * Connection configuration for Ollama via Hanzo Node.
 */
export interface OllamaConnection {
  nodeAddress: string;
  token: string;
}

/**
 * Parse size string (e.g., "14GB", "1.1GB") to bytes.
 */
function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr || sizeStr === 'Unknown') return 0;

  const match = sizeStr.match(/^([\d.]+)\s*(GB|MB|KB|TB)?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] ?? 'GB').toUpperCase();

  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.round(value * (multipliers[unit] ?? multipliers['GB']));
}

/**
 * Extract parameter count from model name/tag (e.g., "8b", "70b").
 */
function extractParameters(nameOrTag: string): string | undefined {
  const match = nameOrTag.match(/(\d+(?:\.\d+)?[bB])/);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Extract quantization from tag (e.g., "q4_K_M", "q8_0", "fp16").
 */
function extractQuantization(tag: string): string | undefined {
  const match = tag.match(/(q\d+_\w+|q\d+_\d+|fp16|fp32)/i);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Infer model quality from parameter count and quantization.
 */
function inferQuality(params?: string, quant?: string): ModelQuality {
  if (!params) return ModelQuality.Medium;

  const paramNum = parseFloat(params.replace(/[bB]/, ''));

  if (paramNum >= 70) return ModelQuality.Excellent;
  if (paramNum >= 30) return ModelQuality.Good;
  if (paramNum >= 7) return ModelQuality.Medium;
  return ModelQuality.Low;
}

/**
 * Infer model speed from parameter count and quantization.
 */
function inferSpeed(params?: string, quant?: string): ModelSpeed {
  if (!params) return ModelSpeed.Average;

  const paramNum = parseFloat(params.replace(/[bB]/, ''));

  if (paramNum <= 1) return ModelSpeed.VeryFast;
  if (paramNum <= 8) return ModelSpeed.Fast;
  if (paramNum <= 30) return ModelSpeed.Average;
  return ModelSpeed.Slow;
}

/**
 * Extract capabilities from model definition.
 */
function extractCapabilities(def?: OllamaModelDefinition): ModelCapability[] {
  const caps: ModelCapability[] = [ModelCapability.TextGeneration];

  if (!def) return caps;

  if (def.vision) caps.push(ModelCapability.Vision);
  if (def.thinking) caps.push(ModelCapability.Thinking);
  if (def.supportTools) caps.push(ModelCapability.ToolCalling);
  if (def.embedding) caps.push(ModelCapability.Embedding);

  return caps;
}

/**
 * Build unique model ID.
 */
function buildModelId(model: string, tag: string): string {
  return `ollama:${model}:${tag}`;
}

/**
 * Parse model:tag string.
 */
function parseModelTag(fullName: string): { model: string; tag: string } {
  const [model, ...tagParts] = fullName.split(':');
  const tag = tagParts.join(':') || 'latest';
  return { model, tag };
}

/**
 * Transform Ollama API response to LocalAIModel.
 */
function transformOllamaModel(
  ollamaModel: ScanOllamaModelsResponse[0],
  modelDefs?: Map<string, OllamaModelDefinition>,
): LocalAIModel {
  const { model: fullName, size, digest, modified_at, details } = ollamaModel;
  const { model, tag } = parseModelTag(fullName);

  const def = modelDefs?.get(model);
  const params = extractParameters(tag) ?? extractParameters(model) ?? details?.parameter_size;
  const quant = extractQuantization(tag) ?? details?.quantization_level;

  return {
    id: buildModelId(model, tag),
    name: model,
    tag,
    displayName: def ? `${model}:${tag}` : fullName,
    description: def?.description ?? `${model} model with ${tag} configuration`,
    engine: LocalAIEngine.Ollama,
    capabilities: extractCapabilities(def),
    sizeBytes: size,
    contextLength: 4096, // Default; Ollama API doesn't expose this
    quality: inferQuality(params, quant),
    speed: inferSpeed(params, quant),
    status: ModelStatus.Installed,
    provider: extractProvider(model),
    parameters: params,
    quantization: quant,
    metadata: {
      digest,
      modifiedAt: modified_at,
      family: details?.family,
      format: details?.format,
      parentModel: details?.parent_model,
    },
  };
}

/**
 * Extract provider from model name.
 */
function extractProvider(modelName: string): string | undefined {
  const providers: Record<string, string> = {
    llama: 'Meta',
    'llama2': 'Meta',
    'llama3': 'Meta',
    'llama3.1': 'Meta',
    'llama3.2': 'Meta',
    'llama3.3': 'Meta',
    mistral: 'Mistral',
    mixtral: 'Mistral',
    qwen: 'Alibaba',
    qwen2: 'Alibaba',
    qwen3: 'Alibaba',
    deepseek: 'DeepSeek',
    'deepseek-r1': 'DeepSeek',
    'deepseek-coder': 'DeepSeek',
    phi: 'Microsoft',
    phi3: 'Microsoft',
    gemma: 'Google',
    gemma2: 'Google',
    'gpt-oss': 'OpenAI',
    codellama: 'Meta',
    starcoder: 'BigCode',
    falcon: 'TII',
    vicuna: 'LMSYS',
    hermes: 'NousResearch',
    'hermes-4': 'NousResearch',
  };

  const lowerName = modelName.toLowerCase();
  for (const [key, provider] of Object.entries(providers)) {
    if (lowerName.startsWith(key)) return provider;
  }
  return undefined;
}

/**
 * Ollama engine adapter.
 *
 * Uses Hanzo Node API as a proxy for Ollama operations.
 */
export class OllamaAdapter implements EngineAdapter {
  readonly engine = LocalAIEngine.Ollama;

  private connection: OllamaConnection;
  private modelDefs: Map<string, OllamaModelDefinition> = new Map();

  constructor(connection: OllamaConnection) {
    this.connection = connection;
  }

  /**
   * Load model definitions for enriching scan results.
   */
  setModelDefinitions(defs: OllamaModelDefinition[]): void {
    this.modelDefs.clear();
    for (const def of defs) {
      this.modelDefs.set(def.name, def);
    }
  }

  /**
   * Update connection configuration.
   */
  setConnection(connection: OllamaConnection): void {
    this.connection = connection;
  }

  async getStatus(): Promise<EngineResult<EngineStatus>> {
    try {
      // Use scan as a health check - if it works, Ollama is available
      await scanOllamaModelsApi(this.connection.nodeAddress, this.connection.token);

      return {
        success: true,
        data: {
          engine: LocalAIEngine.Ollama,
          available: true,
          running: true,
          apiUrl: this.connection.nodeAddress,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: true,
        data: {
          engine: LocalAIEngine.Ollama,
          available: false,
          running: false,
          error: message,
        },
      };
    }
  }

  async scanModels(): Promise<EngineResult<LocalAIModel[]>> {
    try {
      const response = await scanOllamaModelsApi(
        this.connection.nodeAddress,
        this.connection.token,
      );

      // Deduplicate by model name
      const uniqueModels = response.filter(
        (m, i, arr) => i === arr.findIndex((t) => t.model === m.model),
      );

      const models = uniqueModels.map((m) =>
        transformOllamaModel(m, this.modelDefs),
      );

      return { success: true, data: models };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan models';
      return { success: false, error: message };
    }
  }

  async *installModel(
    modelName: string,
    tag: string,
  ): AsyncGenerator<InstallProgress, EngineResult<LocalAIModel>, unknown> {
    const fullName = `${modelName}:${tag}`;
    const modelId = buildModelId(modelName, tag);

    try {
      // Emit initial progress
      yield {
        modelId,
        status: 'Starting installation',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 0,
      };

      // Call the add models API
      await addOllamaModelsApi(
        this.connection.nodeAddress,
        this.connection.token,
        { models: [fullName] },
      );

      // Emit completion progress
      yield {
        modelId,
        status: 'Installation complete',
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 100,
      };

      // Fetch the installed model to return its details
      const scanResult = await this.scanModels();
      if (!scanResult.success) {
        return scanResult;
      }

      const installed = scanResult.data.find(
        (m) => m.name === modelName && m.tag === tag,
      );

      if (!installed) {
        return {
          success: false,
          error: `Model ${fullName} not found after installation`,
        };
      }

      return { success: true, data: installed };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Installation failed';
      yield {
        modelId,
        status: message,
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 0,
      };
      return { success: false, error: message };
    }
  }

  async removeModel(modelId: string): Promise<EngineResult<void>> {
    // Ollama model removal not yet exposed via Hanzo Node API
    // This is a placeholder for when the API is available
    return {
      success: false,
      error: 'Model removal not yet implemented in Hanzo Node API',
    };
  }

  async getModel(modelId: string): Promise<EngineResult<LocalAIModel | null>> {
    const result = await this.scanModels();
    if (!result.success) {
      return result;
    }

    const model = result.data.find((m) => m.id === modelId);
    return { success: true, data: model ?? null };
  }

  async isModelInstalled(modelName: string, tag: string): Promise<boolean> {
    const result = await this.scanModels();
    if (!result.success) return false;

    return result.data.some((m) => m.name === modelName && m.tag === tag);
  }
}

/**
 * Create an Ollama adapter instance.
 */
export function createOllamaAdapter(connection: OllamaConnection): OllamaAdapter {
  return new OllamaAdapter(connection);
}
