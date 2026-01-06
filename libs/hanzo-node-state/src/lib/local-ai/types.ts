/**
 * Core types for engine-agnostic local AI system.
 *
 * Design:
 * - LocalAIEngine: Enumeration of supported engines
 * - LocalAIModel: Unified model representation across engines
 * - EngineAdapter: Interface for engine-specific implementations
 * - EngineStatus: Runtime status of an engine
 */

/**
 * Supported local AI engines.
 */
export enum LocalAIEngine {
  /** Hanzo Node - default, blockchain-integrated with mining rewards */
  HanzoNode = 'hanzo-node',
  /** Ollama - popular local LLM runner */
  Ollama = 'ollama',
  /** LM Studio - desktop LLM application */
  LMStudio = 'lmstudio',
}

/**
 * Model capabilities - unified across all engines.
 */
export enum ModelCapability {
  /** Standard text generation */
  TextGeneration = 'text-generation',
  /** Vision/image understanding */
  Vision = 'vision',
  /** Extended reasoning/thinking */
  Thinking = 'thinking',
  /** Function/tool calling */
  ToolCalling = 'tool-calling',
  /** Embedding generation */
  Embedding = 'embedding',
  /** Code generation/completion */
  Code = 'code',
}

/**
 * Model quality tier for UI hints.
 */
export enum ModelQuality {
  Low = 'low',
  Medium = 'medium',
  Good = 'good',
  Excellent = 'excellent',
}

/**
 * Model speed tier for UI hints.
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
  /** Running/loaded in memory */
  Running = 'running',
  /** Installation failed */
  Failed = 'failed',
}

/**
 * Unified model representation across all engines.
 */
export interface LocalAIModel {
  /** Unique identifier: engine:model:tag */
  readonly id: string;
  /** Model name (e.g., "llama3.1") */
  readonly name: string;
  /** Model tag/variant (e.g., "8b-instruct-q4_1") */
  readonly tag: string;
  /** Display name for UI */
  readonly displayName: string;
  /** Human-readable description */
  readonly description: string;
  /** Source engine */
  readonly engine: LocalAIEngine;
  /** Model capabilities */
  readonly capabilities: readonly ModelCapability[];
  /** Size in bytes */
  readonly sizeBytes: number;
  /** Context window length in tokens */
  readonly contextLength: number;
  /** Quality tier hint */
  readonly quality: ModelQuality;
  /** Speed tier hint */
  readonly speed: ModelSpeed;
  /** Current status */
  status: ModelStatus;
  /** Model provider/source (e.g., "Meta", "Mistral", "ZenLM") */
  readonly provider?: string;
  /** Parameter count (e.g., "8B", "70B") */
  readonly parameters?: string;
  /** Quantization level (e.g., "q4_K_M", "q8_0") */
  readonly quantization?: string;
  /** Engine-specific metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Installation progress information.
 */
export interface InstallProgress {
  /** Model being installed */
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
 * Engine runtime status.
 */
export interface EngineStatus {
  /** Engine identifier */
  readonly engine: LocalAIEngine;
  /** Whether the engine is available/installed */
  readonly available: boolean;
  /** Whether the engine is currently running */
  readonly running: boolean;
  /** Engine version if available */
  readonly version?: string;
  /** API endpoint URL */
  readonly apiUrl?: string;
  /** Error message if unavailable */
  readonly error?: string;
  /** Number of models currently loaded */
  readonly loadedModels?: number;
  /** Memory usage in bytes */
  readonly memoryUsage?: number;
}

/**
 * Result type for operations that can fail.
 */
export type EngineResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

/**
 * Engine adapter interface - implemented by each engine.
 *
 * All methods return Results to handle errors explicitly.
 * Async generators used for streaming progress.
 */
export interface EngineAdapter {
  /** Engine this adapter handles */
  readonly engine: LocalAIEngine;

  /**
   * Check engine status and availability.
   */
  getStatus(): Promise<EngineResult<EngineStatus>>;

  /**
   * Scan for available/installed models.
   * Returns models with their current status.
   */
  scanModels(): Promise<EngineResult<LocalAIModel[]>>;

  /**
   * Install a model by name:tag.
   * Yields progress updates during installation.
   */
  installModel(
    modelName: string,
    tag: string,
  ): AsyncGenerator<InstallProgress, EngineResult<LocalAIModel>, unknown>;

  /**
   * Remove an installed model.
   */
  removeModel(modelId: string): Promise<EngineResult<void>>;

  /**
   * Get a specific model by ID.
   */
  getModel(modelId: string): Promise<EngineResult<LocalAIModel | null>>;

  /**
   * Check if a specific model is installed.
   */
  isModelInstalled(modelName: string, tag: string): Promise<boolean>;
}

/**
 * Query key factory for React Query integration.
 */
export const LocalAIQueryKeys = {
  all: ['local-ai'] as const,
  engines: () => [...LocalAIQueryKeys.all, 'engines'] as const,
  engineStatus: (engine: LocalAIEngine) =>
    [...LocalAIQueryKeys.engines(), engine] as const,
  models: () => [...LocalAIQueryKeys.all, 'models'] as const,
  modelsByEngine: (engine: LocalAIEngine) =>
    [...LocalAIQueryKeys.models(), engine] as const,
  model: (modelId: string) => [...LocalAIQueryKeys.models(), modelId] as const,
  installing: () => [...LocalAIQueryKeys.all, 'installing'] as const,
} as const;
