/**
 * Ollama Model Manager implementation.
 *
 * Provides model management (pull, remove, list) for Ollama.
 * Uses Hanzo Node API as a proxy for Ollama operations.
 *
 * Design:
 * - Implements ModelManager interface
 * - Transforms Ollama responses to unified InstalledModel format
 * - Proxies through Hanzo Node for blockchain integration
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
import { createOllama } from './openai-engine';

/**
 * Connection configuration for Ollama via Hanzo Node.
 */
export interface OllamaConnection {
  /** Hanzo Node address */
  readonly nodeAddress: string;
  /** Authentication token */
  readonly token: string;
  /** Direct Ollama address (for engine) */
  readonly ollamaAddress?: string;
}

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
 * Extract parameter count from model name/tag.
 */
function extractParameters(nameOrTag: string): string | undefined {
  const match = nameOrTag.match(/(\d+(?:\.\d+)?[bB])/);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Extract quantization from tag.
 */
function extractQuantization(tag: string): string | undefined {
  const match = tag.match(/(q\d+_\w+|q\d+_\d+|fp16|fp32)/i);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Infer model quality from parameter count.
 */
function inferQuality(params?: string): ModelQuality {
  if (!params) return ModelQuality.Medium;

  const paramNum = parseFloat(params.replace(/[bB]/, ''));
  if (paramNum >= 70) return ModelQuality.Excellent;
  if (paramNum >= 30) return ModelQuality.Good;
  if (paramNum >= 7) return ModelQuality.Medium;
  return ModelQuality.Low;
}

/**
 * Infer model speed from parameter count.
 */
function inferSpeed(params?: string): ModelSpeed {
  if (!params) return ModelSpeed.Average;

  const paramNum = parseFloat(params.replace(/[bB]/, ''));
  if (paramNum <= 1) return ModelSpeed.VeryFast;
  if (paramNum <= 8) return ModelSpeed.Fast;
  if (paramNum <= 30) return ModelSpeed.Average;
  return ModelSpeed.Slow;
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
 * Extract provider from model name.
 */
function extractProvider(modelName: string): string | undefined {
  const providers: Record<string, string> = {
    llama: 'Meta',
    mistral: 'Mistral',
    mixtral: 'Mistral',
    qwen: 'Alibaba',
    deepseek: 'DeepSeek',
    phi: 'Microsoft',
    gemma: 'Google',
    codellama: 'Meta',
    starcoder: 'BigCode',
    falcon: 'TII',
    vicuna: 'LMSYS',
    hermes: 'NousResearch',
  };

  const lowerName = modelName.toLowerCase();
  for (const [key, provider] of Object.entries(providers)) {
    if (lowerName.startsWith(key)) return provider;
  }
  return undefined;
}

/**
 * Transform Ollama response to InstalledModel.
 */
function transformToInstalledModel(
  model: ScanOllamaModelsResponse[number],
): InstalledModel {
  const { name, tag } = parseModelString(model.model);
  const parameterSize = model.details?.parameter_size;
  const family = model.details?.family;
  const params = extractParameters(tag) ?? extractParameters(name) ?? parameterSize;
  const quant = extractQuantization(tag) ?? model.details?.quantization_level;

  return {
    id: model.model,
    name,
    tag,
    ownedBy: extractProvider(name),
    sizeBytes: model.size,
    contextLength: inferContextLength(family, model.model),
    capabilities: inferCapabilities(model),
    quality: inferQuality(params),
    speed: inferSpeed(params),
    status: ModelStatus.Installed,
    provider: family ? family.charAt(0).toUpperCase() + family.slice(1) : undefined,
    parameters: parameterSize,
    quantization: quant,
    metadata: {
      digest: model.digest,
      modifiedAt: model.modified_at,
      family,
      format: model.details?.format,
      parentModel: model.details?.parent_model,
      ollamaPort: model.port_used,
    },
  };
}

/**
 * Ollama Model Manager.
 *
 * Manages models via Ollama, proxied through Hanzo Node.
 */
export class OllamaModelManager implements ModelManager {
  readonly engine: AIEngine;

  private connection: OllamaConnection;

  constructor(connection: OllamaConnection) {
    this.connection = connection;
    this.engine = createOllama(connection.ollamaAddress ?? 'http://127.0.0.1:11434');
  }

  /**
   * Update connection configuration.
   */
  setConnection(connection: OllamaConnection): void {
    this.connection = connection;
  }

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
      yield {
        modelId: name,
        status: 'Downloading model',
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
        return { ok: false, error: result.error };
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
      return { ok: false, error: message };
    }
  }

  async removeModel(name: string): Promise<Result<void>> {
    // Model removal not yet exposed via Hanzo Node API
    return {
      ok: false,
      error: 'Model removal not yet implemented in Hanzo Node API',
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
      return { ok: false, error: message };
    }
  }

  async getAvailableModels(): Promise<Result<readonly AvailableModel[]>> {
    // Could fetch from Ollama library in the future
    // For now, return empty - models are specified by name
    return { ok: true, value: [] };
  }

  async isModelInstalled(name: string): Promise<boolean> {
    const result = await this.getInstalledModels();
    if (!result.ok) return false;
    return result.value.some((m) => m.id === name);
  }
}

/**
 * Create an Ollama model manager.
 */
export function createOllamaModelManager(
  connection: OllamaConnection,
): OllamaModelManager {
  return new OllamaModelManager(connection);
}

// Legacy exports for backwards compatibility
export { OllamaModelManager as OllamaAdapter };
export { createOllamaModelManager as createOllamaAdapter };
