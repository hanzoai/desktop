/**
 * ModelManager types for local model discovery and management.
 *
 * Separate from EngineAdapter (runtime inference) - ModelManager handles:
 * - Model discovery from registries (Ollama library, HuggingFace, Hanzo)
 * - Model download/installation with progress streaming
 * - Model removal and lifecycle management
 *
 * Engines with ModelManager capability:
 * - Ollama: `ollama pull`, `ollama rm`, library at ollama.com
 * - LM Studio: Downloads from HuggingFace
 * - Hanzo Node: Model management with mining integration
 *
 * Engines WITHOUT ModelManager (cloud APIs):
 * - OpenAI, Anthropic, Groq, etc. - models are server-side
 */

/**
 * Pull/download progress phases.
 */
export type PullStatus =
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'complete'
  | 'error';

/**
 * Progress information during model pull/download.
 */
export interface PullProgress {
  /** Current phase of the pull operation */
  readonly status: PullStatus;
  /** Progress percentage (0-100) */
  readonly progress: number;
  /** Bytes downloaded so far */
  readonly downloadedBytes?: number;
  /** Total bytes to download */
  readonly totalBytes?: number;
  /** Download speed in bytes/second */
  readonly speed?: number;
  /** Estimated time remaining in seconds */
  readonly eta?: number;
  /** Error message if status is 'error' */
  readonly error?: string;
  /** Human-readable status message */
  readonly message?: string;
}

/**
 * A model installed locally on the engine.
 */
export interface InstalledModel {
  /** Unique identifier (engine-specific) */
  readonly id: string;
  /** Model name (e.g., "llama3.1", "qwen3") */
  readonly name: string;
  /** Model tag/version (e.g., "8b", "70b-q4_K_M") */
  readonly tag: string;
  /** Size in bytes on disk */
  readonly sizeBytes: number;
  /** Last modification timestamp */
  readonly modifiedAt: Date;
  /** Model digest/hash for verification */
  readonly digest: string;
  /** Engine-specific metadata */
  readonly metadata: Record<string, unknown>;
}

/**
 * Model source registry/origin.
 */
export type ModelSource = 'ollama' | 'huggingface' | 'hanzo' | 'local';

/**
 * Mining reward information for Hanzo models.
 */
export interface MiningInfo {
  /** Whether this model is eligible for mining rewards */
  readonly eligible: boolean;
  /** Estimated reward rate (tokens per hour) */
  readonly rewardRate?: number;
  /** Minimum VRAM required for mining */
  readonly minVramGb?: number;
  /** Mining pool identifier */
  readonly poolId?: string;
}

/**
 * A model available for download from a registry.
 */
export interface AvailableModel {
  /** Unique identifier */
  readonly id: string;
  /** Model name */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Available tags/versions/quantizations */
  readonly tags: readonly string[];
  /** Download count (if available) */
  readonly downloads?: number;
  /** Source registry */
  readonly source: ModelSource;
  /** Mining reward info (Hanzo models only) */
  readonly miningRewards?: MiningInfo;
  /** Model provider/organization */
  readonly provider?: string;
  /** Model capabilities (vision, tools, etc.) */
  readonly capabilities?: readonly string[];
  /** Recommended tag for general use */
  readonly recommendedTag?: string;
}

/**
 * Options for pulling a model.
 */
export interface PullOptions {
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
  /** Force re-download even if model exists */
  readonly force?: boolean;
  /** Specific layer/blob to resume from */
  readonly resumeFrom?: string;
}

/**
 * Options for searching models.
 */
export interface SearchOptions {
  /** Maximum results to return */
  readonly limit?: number;
  /** Filter by source registry */
  readonly source?: ModelSource;
  /** Filter by capability */
  readonly capability?: string;
  /** Filter by provider */
  readonly provider?: string;
}

/**
 * Detailed model information.
 */
export interface ModelInfo {
  /** Basic model data */
  readonly model: InstalledModel;
  /** License information */
  readonly license?: string;
  /** Model architecture (e.g., "llama", "qwen") */
  readonly architecture?: string;
  /** Parameter count string (e.g., "8B", "70B") */
  readonly parameters?: string;
  /** Quantization level (e.g., "Q4_K_M") */
  readonly quantization?: string;
  /** Context window size in tokens */
  readonly contextLength?: number;
  /** Template format for prompts */
  readonly template?: string;
  /** System prompt if any */
  readonly system?: string;
  /** Model family identifiers */
  readonly families?: readonly string[];
}

/**
 * ModelManager interface for engines that can download/manage models locally.
 *
 * Not all AI engines support this - cloud APIs (OpenAI, Anthropic, etc.)
 * do not have local model management.
 */
export interface ModelManager {
  /** Engine identifier this manager handles */
  readonly engineId: string;

  // ============ Discovery ============

  /**
   * Get all models currently installed on this engine.
   */
  getInstalledModels(): Promise<InstalledModel[]>;

  /**
   * Get models available for download from the registry.
   * Returns a subset of popular/featured models.
   */
  getAvailableModels(): Promise<AvailableModel[]>;

  /**
   * Search for models in the registry.
   */
  searchModels(query: string, options?: SearchOptions): Promise<AvailableModel[]>;

  // ============ Management ============

  /**
   * Pull/download a model from the registry.
   * Yields progress updates during download.
   *
   * @param modelId - Model identifier (e.g., "llama3.1:8b")
   * @param options - Pull options (abort signal, force, etc.)
   * @yields PullProgress updates
   */
  pullModel(
    modelId: string,
    options?: PullOptions,
  ): AsyncGenerator<PullProgress, void, unknown>;

  /**
   * Remove an installed model.
   *
   * @param modelId - Model identifier to remove
   * @throws Error if model not found or removal fails
   */
  removeModel(modelId: string): Promise<void>;

  // ============ Status ============

  /**
   * Check if a model is installed.
   *
   * @param modelId - Model identifier to check
   */
  isModelInstalled(modelId: string): Promise<boolean>;

  /**
   * Get detailed information about an installed model.
   * Returns null if model is not installed.
   *
   * @param modelId - Model identifier
   */
  getModelInfo(modelId: string): Promise<ModelInfo | null>;
}

/**
 * Engine capabilities for model management.
 */
export interface ModelManagerCapabilities {
  /** Can search remote registries */
  readonly canSearch: boolean;
  /** Can show download progress */
  readonly hasProgress: boolean;
  /** Can cancel ongoing downloads */
  readonly canCancel: boolean;
  /** Can resume interrupted downloads */
  readonly canResume: boolean;
  /** Has mining/reward integration */
  readonly hasMining: boolean;
}

/**
 * Query keys for React Query integration.
 */
export const ModelManagerQueryKeys = {
  all: ['model-manager'] as const,
  installed: (engineId: string) =>
    [...ModelManagerQueryKeys.all, 'installed', engineId] as const,
  available: (engineId: string) =>
    [...ModelManagerQueryKeys.all, 'available', engineId] as const,
  search: (engineId: string, query: string) =>
    [...ModelManagerQueryKeys.all, 'search', engineId, query] as const,
  info: (engineId: string, modelId: string) =>
    [...ModelManagerQueryKeys.all, 'info', engineId, modelId] as const,
  pulling: () => [...ModelManagerQueryKeys.all, 'pulling'] as const,
} as const;
