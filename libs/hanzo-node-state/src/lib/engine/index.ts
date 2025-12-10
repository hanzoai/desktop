/**
 * Engine - Generic inference endpoint abstraction.
 *
 * An Engine is "something I can send chat messages to."
 * All engines expose an OpenAI-compatible API (or adapter).
 *
 * ## Architecture
 *
 * ### Engine Interface
 * Generic interface for any inference endpoint - just a URL:
 * - `chat()` - Streaming chat completion
 * - `complete()` - Non-streaming text completion
 * - `embed()` - Generate embeddings
 * - `listModels()` - List available models
 *
 * ### Engine Types by Deployment
 *
 * **Embedded** (runs IN the app, no HTTP):
 * - `hanzo-engine` - Direct Rust bindings via Tauri
 *
 * **Sidecar** (separate process, managed by app):
 * - `Ollama` - App can start/stop, managed process
 * - `Hanzo Node` - App can start/stop, managed process
 *
 * **External** (user-managed, just API endpoint):
 * - `LM Studio` - User runs separately
 * - `OpenAI` - Cloud API
 * - `Anthropic` - Cloud API
 * - `Groq` - Cloud API
 * - Any OpenAI-compatible server
 *
 * ## Usage
 *
 * ```typescript
 * // Create engine from preset
 * import { createOpenAI, createOllama } from './engine';
 *
 * const openai = createOpenAI('sk-xxx', 'gpt-4o');
 * const ollama = createOllama();
 *
 * // Chat with streaming
 * for await (const chunk of openai.chat([{ role: 'user', content: 'Hello' }])) {
 *   process.stdout.write(chunk.content);
 * }
 *
 * // Sidecar with model management
 * import { createOllama as createOllamaSidecar } from './engine/sidecar';
 * const sidecar = createOllamaSidecar();
 * for await (const progress of sidecar.pullModel('llama3.2:3b')) {
 *   console.log(`${progress.percent}%`);
 * }
 *
 * // Embedded engine (requires Tauri)
 * import { createHanzoEngine } from './engine/embedded';
 * import { invoke } from '@tauri-apps/api/core';
 * import { listen } from '@tauri-apps/api/event';
 *
 * const engine = createHanzoEngine({ invoke, listen });
 * await engine.loadModel('/path/to/model.gguf');
 * ```
 */

// Core types and base implementation
export {
  // Types
  type ChatChunk,
  type ChatOptions,
  type CompleteOptions,
  type Engine,
  type EngineConfig,
  type EngineStatus,
  type Message,
  type MessageRole,
  type Model,
  type Result,
  type ToolCall,
  type ToolDefinition,

  // Implementation
  createEngine,
  OpenAICompatibleEngine,
  parseSSEStream,

  // Query keys
  EngineQueryKeys,
} from './types';

// Engine presets
export {
  DeploymentType,
  ENGINE_PRESETS,
  EnginePreset,
  ANTHROPIC_PRESET,
  GROQ_PRESET,
  HANZO_ENGINE_PRESET,
  HANZO_GATEWAY_PRESET,
  HANZO_NODE_PRESET,
  LM_STUDIO_PRESET,
  MLX_ENGINE_PRESET,
  OLLAMA_PRESET,
  OPENAI_COMPATIBLE_PRESET,
  OPENAI_PRESET,
  getAllPresets,
  getPreset,
  getPresetsByDeployment,
  createFromPreset,
  createOpenAI,
  createAnthropic,
  createGroq,
  createLMStudio,
  createHanzoGateway,
  // Note: createOllama and createHanzoNode are exported from sidecar with full capabilities
} from './presets';

// Embedded engine (hanzo-engine Tauri plugin)
export * from './embedded';

// Sidecar engines (app-managed processes) - these have model management
export * from './sidecar';
