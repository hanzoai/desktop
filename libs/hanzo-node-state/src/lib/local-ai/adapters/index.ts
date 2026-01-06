/**
 * Engine adapter exports.
 *
 * Each adapter implements the EngineAdapter interface from ../types.ts
 * and provides engine-specific model management operations.
 */

export {
  HanzoNodeAdapter,
  createHanzoNodeAdapter,
  HANZO_NODE_BENEFITS,
  HANZO_NODE_ENGINE_INFO,
  type HanzoNodeConfig,
  type HanzoModelMetadata,
} from './hanzo-node-adapter';

export {
  OllamaAdapter,
  createOllamaAdapter,
  type OllamaConnection,
} from './ollama-adapter';
