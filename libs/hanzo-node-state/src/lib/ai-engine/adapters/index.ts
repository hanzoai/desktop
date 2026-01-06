/**
 * AI Engine adapter exports.
 *
 * Provides:
 * - OpenAIEngine: Generic OpenAI-compatible engine (works with any OpenAI-compatible server)
 * - OllamaModelManager: Model management for Ollama
 * - HanzoNodeModelManager: Model management for Hanzo Node
 */

// OpenAI-compatible engine
export {
  OpenAIEngine,
  createOpenAIEngine,
  createOpenAI,
  createOllama,
  createLMStudio,
  createHanzoGateway,
  type OpenAIEngineConfig,
} from './openai-engine';

// Ollama model manager
export {
  OllamaModelManager,
  createOllamaModelManager,
  type OllamaConnection,
  // Legacy exports
  OllamaModelManager as OllamaAdapter,
  createOllamaModelManager as createOllamaAdapter,
} from './ollama-model-manager';

// Hanzo Node model manager
export {
  HanzoNodeEngine,
  HanzoNodeModelManager,
  createHanzoNodeModelManager,
  HANZO_NODE_BENEFITS,
  HANZO_NODE_ENGINE_INFO,
  type HanzoNodeConnection,
  type HanzoModelMetadata,
  // Legacy exports
  HanzoNodeModelManager as HanzoNodeAdapter,
  createHanzoNodeModelManager as createHanzoNodeAdapter,
  type HanzoNodeConnection as HanzoNodeConfig,
} from './hanzo-node-model-manager';
