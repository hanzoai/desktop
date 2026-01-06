/**
 * AI Engine abstraction layer.
 *
 * Architecture:
 * 1. AIEngine - Any OpenAI/Anthropic-compatible endpoint (local or remote)
 * 2. ModelManager - For engines that can download/manage models locally
 * 3. EmbeddedEngine - Direct inference without HTTP (hanzo-engine bindings)
 *
 * Usage:
 *
 * ```typescript
 * // Create an engine for any OpenAI-compatible server
 * const engine = createOpenAIEngine({
 *   id: 'my-server',
 *   name: 'My Server',
 *   baseUrl: 'http://localhost:8000/v1',
 * });
 *
 * // Chat with streaming
 * for await (const chunk of engine.chat([{ role: 'user', content: 'Hello' }])) {
 *   process.stdout.write(chunk.content);
 * }
 *
 * // For engines that manage models (Ollama, Hanzo Node)
 * const manager = createOllamaModelManager({
 *   nodeAddress: 'http://localhost:9550',
 *   token: 'my-token',
 * });
 *
 * // Pull a model
 * for await (const progress of manager.pullModel('llama3.1:8b')) {
 *   console.log(`${progress.percent}% - ${progress.status}`);
 * }
 * ```
 */

// Core types
export {
  // Message types
  type Message,
  type MessageRole,
  type ChatChunk,
  type ToolCall,
  type ToolDefinition,

  // Options types
  type ChatOptions,
  type CompleteOptions,

  // Model types
  type Model,
  type InstalledModel,
  type AvailableModel,
  type PullProgress,

  // Status types
  type EngineStatus,
  type Result,

  // Core interfaces
  type AIEngine,
  type ModelManager,
  type EmbeddedEngine,

  // Enums
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,

  // Query keys
  AIEngineQueryKeys,

  // Legacy exports
  ModelCapability as LocalAIModelCapability,
  ModelQuality as LocalAIModelQuality,
  ModelSpeed as LocalAIModelSpeed,
  ModelStatus as LocalAIModelStatus,
} from './types';

// Engine presets
export {
  EngineCategory,
  type EngineFeatures,
  type EngineBenefit,
  type EnginePreset,

  // Preset instances
  OLLAMA_PRESET,
  LM_STUDIO_PRESET,
  HANZO_NODE_PRESET,
  HANZO_GATEWAY_PRESET,
  OPENAI_PRESET,
  ANTHROPIC_PRESET,
  OPENAI_COMPATIBLE_PRESET,
  ENGINE_PRESETS,

  // Preset helpers
  getEnginePreset,
  getDefaultPreset,
  getAllPresets,
  getPresetsByCategory,
  getModelManagerPresets,

  // Legacy exports
  HANZO_NODE_PRESET as HANZO_NODE_CONFIG,
  OLLAMA_PRESET as OLLAMA_CONFIG,
  LM_STUDIO_PRESET as LM_STUDIO_CONFIG,
} from './engine-presets';

// Adapters
export * from './adapters';
