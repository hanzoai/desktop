/**
 * ModelManager abstraction for local model discovery and management.
 *
 * This is SEPARATE from EngineAdapter (AIEngine) - ModelManager handles:
 * - Model discovery from registries
 * - Model download/installation with progress
 * - Model removal and lifecycle
 *
 * Engines with ModelManager:
 * - Ollama: ollama.com library
 * - LM Studio: HuggingFace downloads
 * - Hanzo Node: Mining-integrated model management
 *
 * Engines WITHOUT ModelManager (cloud APIs):
 * - OpenAI, Anthropic, Groq, etc.
 */

export * from './types';

export {
  OllamaModelManager,
  createOllamaManager,
  OLLAMA_MANAGER_CAPABILITIES,
  type OllamaManagerConfig,
} from './ollama-manager';

export {
  HanzoNodeModelManager,
  createHanzoNodeManager,
  HANZO_NODE_MANAGER_CAPABILITIES,
  type HanzoNodeManagerConfig,
} from './hanzo-node-manager';

import { LocalAIEngine } from '../local-ai/types';
import {
  OllamaModelManager,
  createOllamaManager,
  type OllamaManagerConfig,
} from './ollama-manager';
import {
  HanzoNodeModelManager,
  createHanzoNodeManager,
  type HanzoNodeManagerConfig,
} from './hanzo-node-manager';
import type { ModelManager } from './types';

/**
 * Configuration for creating a model manager.
 */
export type ModelManagerConfig =
  | { engine: 'ollama'; config?: OllamaManagerConfig }
  | { engine: 'hanzo-node'; config: HanzoNodeManagerConfig }
  | { engine: LocalAIEngine.Ollama; config?: OllamaManagerConfig }
  | { engine: LocalAIEngine.HanzoNode; config: HanzoNodeManagerConfig };

/**
 * Engines that support ModelManager.
 */
export const ENGINES_WITH_MODEL_MANAGER = [
  LocalAIEngine.Ollama,
  LocalAIEngine.HanzoNode,
  // LM Studio would go here when implemented
] as const;

/**
 * Check if an engine supports ModelManager.
 */
export function hasModelManager(engine: string): boolean {
  return (ENGINES_WITH_MODEL_MANAGER as readonly string[]).includes(engine);
}

/**
 * Factory function to create a ModelManager for an engine.
 *
 * @param options - Engine type and configuration
 * @returns ModelManager instance or null if engine doesn't support it
 *
 * @example
 * ```typescript
 * // Ollama with default config
 * const ollama = createModelManager({ engine: 'ollama' });
 *
 * // Ollama with custom host
 * const ollama = createModelManager({
 *   engine: 'ollama',
 *   config: { host: 'http://192.168.1.100:11434' }
 * });
 *
 * // Hanzo Node
 * const hanzo = createModelManager({
 *   engine: 'hanzo-node',
 *   config: { nodeAddress: 'http://127.0.0.1:9550', token: 'xyz' }
 * });
 * ```
 */
export function createModelManager(
  options: ModelManagerConfig,
): ModelManager | null {
  const { engine, config } = options;

  switch (engine) {
    case 'ollama':
    case LocalAIEngine.Ollama:
      return createOllamaManager(config as OllamaManagerConfig | undefined);

    case 'hanzo-node':
    case LocalAIEngine.HanzoNode:
      return createHanzoNodeManager(config as HanzoNodeManagerConfig);

    default:
      // LM Studio, cloud engines, etc. - no ModelManager support yet
      return null;
  }
}

/**
 * Type guard to check if manager is OllamaModelManager.
 */
export function isOllamaManager(
  manager: ModelManager,
): manager is OllamaModelManager {
  return manager.engineId === 'ollama';
}

/**
 * Type guard to check if manager is HanzoNodeModelManager.
 */
export function isHanzoNodeManager(
  manager: ModelManager,
): manager is HanzoNodeModelManager {
  return manager.engineId === 'hanzo-node';
}
