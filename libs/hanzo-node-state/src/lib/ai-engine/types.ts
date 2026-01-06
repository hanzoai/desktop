/**
 * Generic AI Engine interfaces.
 *
 * Architecture:
 * 1. AIEngine - Any OpenAI/Anthropic-compatible endpoint (local or remote)
 * 2. ModelManager - For engines that can download/manage models locally
 * 3. EmbeddedEngine - Direct inference without HTTP (hanzo-engine bindings)
 *
 * Design principles:
 * - AIEngine is the core abstraction: just a URL + optional API key
 * - ModelManager is optional: only some engines can manage models
 * - Prefer composition over inheritance
 */

/**
 * Chat message role.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Chat message.
 */
export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  /** Tool call ID for tool responses */
  readonly toolCallId?: string;
  /** Name for function/tool messages */
  readonly name?: string;
}

/**
 * Streaming chat chunk.
 */
export interface ChatChunk {
  /** Delta content */
  readonly content: string;
  /** Finish reason if final chunk */
  readonly finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Tool calls if any */
  readonly toolCalls?: readonly ToolCall[];
}

/**
 * Tool/function call.
 */
export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

/**
 * Tool definition for function calling.
 */
export interface ToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

/**
 * Chat completion options.
 */
export interface ChatOptions {
  /** Model to use (overrides engine default) */
  readonly model?: string;
  /** Temperature (0-2) */
  readonly temperature?: number;
  /** Max tokens to generate */
  readonly maxTokens?: number;
  /** Stop sequences */
  readonly stop?: readonly string[];
  /** Tools for function calling */
  readonly tools?: readonly ToolDefinition[];
  /** Response format */
  readonly responseFormat?: { type: 'text' | 'json_object' };
  /** Timeout in milliseconds */
  readonly timeout?: number;
}

/**
 * Text completion options.
 */
export interface CompleteOptions {
  /** Model to use */
  readonly model?: string;
  /** Temperature */
  readonly temperature?: number;
  /** Max tokens */
  readonly maxTokens?: number;
  /** Stop sequences */
  readonly stop?: readonly string[];
  /** Timeout in milliseconds */
  readonly timeout?: number;
}

/**
 * Model information from an engine.
 */
export interface Model {
  /** Model identifier (used in API calls) */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Model owner/creator */
  readonly ownedBy?: string;
  /** Creation timestamp */
  readonly created?: number;
}

/**
 * Engine connection status.
 */
export interface EngineStatus {
  /** Whether the engine is reachable */
  readonly available: boolean;
  /** Whether the engine is ready to serve requests */
  readonly ready: boolean;
  /** Engine version if available */
  readonly version?: string;
  /** Error message if unavailable */
  readonly error?: string;
}

/**
 * Result type for fallible operations.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * AI Engine interface.
 *
 * Any OpenAI/Anthropic-compatible endpoint. Just needs a URL.
 * Works with: Ollama, LM Studio, Hanzo Gateway, OpenAI, Anthropic,
 * vLLM, text-generation-inference, any OpenAI-compatible server.
 */
export interface AIEngine {
  /** Unique engine identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Base URL for API calls */
  readonly baseUrl: string;
  /** API key (optional for local engines) */
  readonly apiKey?: string;
  /** Default model to use */
  readonly defaultModel?: string;

  /**
   * Check engine status and availability.
   */
  getStatus(): Promise<Result<EngineStatus>>;

  /**
   * List available models.
   */
  listModels(): Promise<Result<readonly Model[]>>;

  /**
   * Streaming chat completion.
   */
  chat(
    messages: readonly Message[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk, void, unknown>;

  /**
   * Non-streaming text completion.
   */
  complete(prompt: string, options?: CompleteOptions): Promise<Result<string>>;

  /**
   * Generate embeddings.
   */
  embed(
    input: string | readonly string[],
    model?: string,
  ): Promise<Result<readonly number[][]>>;
}

/**
 * Model capability flags.
 */
export enum ModelCapability {
  TextGeneration = 'text-generation',
  Vision = 'vision',
  Thinking = 'thinking',
  ToolCalling = 'tool-calling',
  Embedding = 'embedding',
  Code = 'code',
}

/**
 * Model quality tier (for UI hints).
 */
export enum ModelQuality {
  Low = 'low',
  Medium = 'medium',
  Good = 'good',
  Excellent = 'excellent',
}

/**
 * Model speed tier (for UI hints).
 */
export enum ModelSpeed {
  Slow = 'slow',
  Average = 'average',
  Fast = 'fast',
  VeryFast = 'very-fast',
}

/**
 * Model installation status.
 */
export enum ModelStatus {
  /** Not installed locally */
  Available = 'available',
  /** Currently downloading/installing */
  Installing = 'installing',
  /** Installed and ready */
  Installed = 'installed',
  /** Loaded in memory and running */
  Running = 'running',
  /** Installation or load failed */
  Failed = 'failed',
}

/**
 * Installed model with local metadata.
 */
export interface InstalledModel extends Model {
  /** Size on disk in bytes */
  readonly sizeBytes: number;
  /** Model tag/variant */
  readonly tag: string;
  /** Context window length */
  readonly contextLength: number;
  /** Model capabilities */
  readonly capabilities: readonly ModelCapability[];
  /** Quality tier hint */
  readonly quality: ModelQuality;
  /** Speed tier hint */
  readonly speed: ModelSpeed;
  /** Current status */
  readonly status: ModelStatus;
  /** Model provider (e.g., "Meta", "Alibaba") */
  readonly provider?: string;
  /** Parameter count (e.g., "8B", "70B") */
  readonly parameters?: string;
  /** Quantization level */
  readonly quantization?: string;
  /** Engine-specific metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Available model from a registry.
 */
export interface AvailableModel {
  /** Model name */
  readonly name: string;
  /** Description */
  readonly description: string;
  /** Available tags/variants */
  readonly tags: readonly string[];
  /** Default tag */
  readonly defaultTag: string;
  /** Estimated download size */
  readonly downloadSize?: number;
  /** Model capabilities */
  readonly capabilities?: readonly ModelCapability[];
  /** Model provider */
  readonly provider?: string;
}

/**
 * Model pull/download progress.
 */
export interface PullProgress {
  /** Model being pulled */
  readonly modelId: string;
  /** Current status message */
  readonly status: string;
  /** Bytes downloaded */
  readonly downloadedBytes: number;
  /** Total bytes to download */
  readonly totalBytes: number;
  /** Progress percentage (0-100) */
  readonly percent: number;
  /** Estimated time remaining in seconds */
  readonly etaSeconds?: number;
}

/**
 * Model Manager interface.
 *
 * For engines that can download and manage models locally.
 * Examples: Ollama, LM Studio, Hanzo Node, hanzo-engine.
 * NOT cloud APIs like OpenAI/Anthropic.
 */
export interface ModelManager {
  /** The underlying AI engine */
  readonly engine: AIEngine;

  /**
   * Pull/download a model.
   * Yields progress updates during download.
   */
  pullModel(name: string): AsyncGenerator<PullProgress, Result<InstalledModel>, unknown>;

  /**
   * Remove an installed model.
   */
  removeModel(name: string): Promise<Result<void>>;

  /**
   * Get installed models.
   */
  getInstalledModels(): Promise<Result<readonly InstalledModel[]>>;

  /**
   * Get available models from registry.
   */
  getAvailableModels(): Promise<Result<readonly AvailableModel[]>>;

  /**
   * Check if a model is installed.
   */
  isModelInstalled(name: string): Promise<boolean>;
}

/**
 * Embedded Engine interface.
 *
 * Direct inference without HTTP. Uses hanzo-engine bindings.
 * Extends AIEngine with model loading/unloading.
 */
export interface EmbeddedEngine extends AIEngine {
  /**
   * Load a model from a file path.
   */
  loadModel(path: string): Promise<Result<void>>;

  /**
   * Unload the current model.
   */
  unloadModel(): Promise<Result<void>>;

  /**
   * Get the currently loaded model.
   */
  getLoadedModel(): string | null;

  /**
   * Get memory usage in bytes.
   */
  getMemoryUsage(): Promise<number>;
}

/**
 * Query key factory for React Query integration.
 */
export const AIEngineQueryKeys = {
  all: ['ai-engine'] as const,
  engines: () => [...AIEngineQueryKeys.all, 'engines'] as const,
  engine: (id: string) => [...AIEngineQueryKeys.engines(), id] as const,
  status: (id: string) => [...AIEngineQueryKeys.engine(id), 'status'] as const,
  models: (id: string) => [...AIEngineQueryKeys.engine(id), 'models'] as const,
  installed: (id: string) =>
    [...AIEngineQueryKeys.engine(id), 'installed'] as const,
  available: (id: string) =>
    [...AIEngineQueryKeys.engine(id), 'available'] as const,
  pulling: () => [...AIEngineQueryKeys.all, 'pulling'] as const,
} as const;

// Re-export legacy types for backwards compatibility
// TODO: Remove after migration complete
export {
  ModelCapability as LocalAIModelCapability,
  ModelQuality as LocalAIModelQuality,
  ModelSpeed as LocalAIModelSpeed,
  ModelStatus as LocalAIModelStatus,
};
