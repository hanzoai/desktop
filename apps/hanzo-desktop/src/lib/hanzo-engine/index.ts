/**
 * Hanzo Engine - Embedded AI Inference
 *
 * This module provides the frontend interface to the embedded Hanzo Engine,
 * which runs in the Tauri backend and exposes an OpenAI-compatible API
 * on localhost:36900.
 *
 * Usage:
 * ```typescript
 * import { useHanzoEngine, hanzoEngine } from '@/lib/hanzo-engine';
 *
 * // In a React component:
 * const { status, loadModel, chat, streamChat } = useHanzoEngine();
 *
 * // Load a model
 * await loadModel({ model_id: 'path/to/model.gguf' });
 *
 * // Chat (non-streaming)
 * const response = await chat({
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * // Chat (streaming)
 * await streamChat(
 *   [{ role: 'user', content: 'Hello!' }],
 *   'default',
 *   { onChunk: (chunk) => console.log(chunk) }
 * );
 * ```
 */

// Types
export type {
  EngineStatus,
  LoadModelOptions,
  ChatMessage,
  ChatOptions,
  ChatChoice,
  UsageStats,
  ChatCompletionResponse,
  StreamChunk,
  ModelInfo,
  ModelsResponse,
  EngineError,
  ChatCompletionRequest,
  EmbeddingRequest,
  EmbeddingResponse,
} from './types';

export { EngineEvent, ModelFormat, detectModelFormat } from './types';

// Client
export { HanzoEngineClient, hanzoEngine, HANZO_ENGINE_BASE_URL } from './client';

// Hooks
export {
  engineQueryKeys,
  useEngineStatus,
  useEngineModels,
  useEngineAvailable,
  useLoadModel,
  useUnloadModel,
  useChat,
  useEmbeddings,
  useStreamingChat,
  useEngineReady,
  useHanzoEngine,
} from './hooks';
