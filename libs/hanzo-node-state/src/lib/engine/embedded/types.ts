/**
 * EmbeddedEngine types for direct inference via hanzo-engine Tauri plugin.
 *
 * Architecture:
 * - hanzo-engine is a Rust library wrapping mistral.rs
 * - Uses Candle ML framework for inference
 * - Supports GGUF models (quantized LLMs)
 * - Embedded as a Tauri plugin (no HTTP server)
 *
 * Constraints:
 * - Single model loaded at a time (memory constraints)
 * - GPU acceleration via Metal (macOS) or CUDA
 * - Model files stored on local filesystem
 */

import type { Engine, Result } from '../types';

/**
 * Model loading options.
 */
export interface LoadOptions {
  /** Context window length (tokens). Defaults to model's native context. */
  readonly contextLength?: number;
  /** Number of layers to offload to GPU. 0 = CPU only, -1 = all layers. */
  readonly gpuLayers?: number;
  /** Number of CPU threads for inference. Defaults to system thread count. */
  readonly threads?: number;
  /** Flash attention (requires compatible GPU). */
  readonly flashAttention?: boolean;
  /** Enable KV cache for faster inference. Default true. */
  readonly kvCache?: boolean;
  /** Prefix cache size for repeated prompts. Default 16. */
  readonly prefixCacheN?: number;
}

/**
 * Information about a loaded model.
 */
export interface LoadedModelInfo {
  /** Absolute path to the model file. */
  readonly path: string;
  /** Model display name (derived from filename). */
  readonly name: string;
  /** Model size on disk in bytes. */
  readonly sizeBytes: number;
  /** Active context window length. */
  readonly contextLength: number;
  /** Quantization format (e.g., "Q4_K_M", "Q8_0"). */
  readonly quantization: string;
  /** GGUF architecture (e.g., "llama", "qwen3", "phi3"). */
  readonly architecture: string;
  /** Parameter count if available (e.g., "8B"). */
  readonly parameters?: string;
  /** Number of GPU layers actually loaded. */
  readonly gpuLayers: number;
}

/**
 * Memory usage information.
 */
export interface MemoryInfo {
  /** RAM used by the model in bytes. */
  readonly ramBytes: number;
  /** VRAM used by the model in bytes. */
  readonly vramBytes: number;
  /** Total system RAM available. */
  readonly totalRamBytes: number;
  /** Total GPU VRAM available. */
  readonly totalVramBytes: number;
}

/**
 * GPU device information.
 */
export interface GpuInfo {
  /** GPU backend: "metal", "cuda", or "cpu". */
  readonly backend: 'metal' | 'cuda' | 'cpu';
  /** Device name (e.g., "Apple M2 Pro"). */
  readonly name: string;
  /** Total VRAM in bytes. */
  readonly vramBytes: number;
  /** Available VRAM in bytes. */
  readonly availableVramBytes: number;
  /** Compute capability (CUDA) or family (Metal). */
  readonly computeCapability?: string;
}

/**
 * Streaming event from Tauri.
 */
export interface StreamEvent {
  /** Event type. */
  readonly type: 'token' | 'done' | 'error';
  /** Token content (for type="token"). */
  readonly content?: string;
  /** Finish reason (for type="done"). */
  readonly finishReason?: 'stop' | 'length';
  /** Error message (for type="error"). */
  readonly error?: string;
}

/**
 * Embedded Engine interface.
 *
 * Direct inference using hanzo-engine (mistral.rs) compiled into Tauri.
 * No HTTP server - all calls go through Tauri IPC.
 *
 * Extends Engine with model lifecycle management.
 */
export interface EmbeddedEngine extends Engine {
  /**
   * Load a GGUF model from the filesystem.
   *
   * Only one model can be loaded at a time. Loading a new model
   * automatically unloads the previous one.
   *
   * @param modelPath - Absolute path to the .gguf file
   * @param options - Loading configuration
   */
  loadModel(modelPath: string, options?: LoadOptions): Promise<Result<void>>;

  /**
   * Unload the current model and free resources.
   */
  unloadModel(): Promise<Result<void>>;

  /**
   * Check if a model is currently loaded.
   */
  isModelLoaded(): boolean;

  /**
   * Get information about the currently loaded model.
   * Returns null if no model is loaded.
   */
  getLoadedModel(): LoadedModelInfo | null;

  /**
   * Get current memory usage.
   */
  getMemoryUsage(): Promise<MemoryInfo>;

  /**
   * Get GPU device information.
   * Returns null if no GPU is available.
   */
  getGpuInfo(): Promise<GpuInfo | null>;

  /**
   * Cancel any in-progress generation.
   */
  cancelGeneration(): Promise<void>;
}

/**
 * Tauri command names for the embedded engine plugin.
 *
 * These map to Rust functions in the Tauri plugin.
 */
export const TauriCommands = {
  /** Load a model from path. */
  loadModel: 'plugin:hanzo-engine|load_model',
  /** Unload current model. */
  unloadModel: 'plugin:hanzo-engine|unload_model',
  /** Get loaded model info. */
  getLoadedModel: 'plugin:hanzo-engine|get_loaded_model',
  /** Check if model is loaded. */
  isModelLoaded: 'plugin:hanzo-engine|is_model_loaded',
  /** Get memory usage. */
  getMemoryUsage: 'plugin:hanzo-engine|get_memory_usage',
  /** Get GPU info. */
  getGpuInfo: 'plugin:hanzo-engine|get_gpu_info',
  /** Chat completion (non-streaming). */
  chat: 'plugin:hanzo-engine|chat',
  /** Text completion (non-streaming). */
  complete: 'plugin:hanzo-engine|complete',
  /** Generate embeddings. */
  embed: 'plugin:hanzo-engine|embed',
  /** Cancel current generation. */
  cancel: 'plugin:hanzo-engine|cancel',
  /** Get engine status. */
  getStatus: 'plugin:hanzo-engine|get_status',
} as const;

/**
 * Tauri event names for streaming responses.
 */
export const TauriEvents = {
  /** Token stream during generation. */
  stream: 'hanzo-engine:stream',
  /** Model loading progress. */
  loadProgress: 'hanzo-engine:load-progress',
} as const;

/**
 * Query keys for React Query integration.
 */
export const EmbeddedEngineQueryKeys = {
  all: ['embedded-engine'] as const,
  status: () => [...EmbeddedEngineQueryKeys.all, 'status'] as const,
  loadedModel: () => [...EmbeddedEngineQueryKeys.all, 'loaded-model'] as const,
  memory: () => [...EmbeddedEngineQueryKeys.all, 'memory'] as const,
  gpu: () => [...EmbeddedEngineQueryKeys.all, 'gpu'] as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MLX Engine Types (Apple Silicon only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MLX model loading options.
 *
 * MLX models are pre-quantized in safetensors format from mlx-community.
 * They leverage unified memory on Apple Silicon for zero-copy GPU access.
 */
export interface MLXLoadOptions {
  /** Maximum sequence length. Defaults to model's native context. */
  readonly maxSequenceLength?: number;
  /** Memory limit in bytes. MLX will use unified memory efficiently. */
  readonly memoryLimit?: number;
  /** Use 4-bit quantization for lower memory usage. */
  readonly quantize4bit?: boolean;
  /** Prefill chunk size for KV cache optimization. Default 512. */
  readonly prefillChunkSize?: number;
  /** Enable speculative decoding if draft model available. */
  readonly speculativeDecoding?: boolean;
}

/**
 * Information about a loaded MLX model.
 */
export interface MLXLoadedModelInfo {
  /** Model ID (e.g., "mlx-community/Qwen3-8B-4bit"). */
  readonly modelId: string;
  /** Local path to the model directory. */
  readonly path: string;
  /** Display name derived from model ID. */
  readonly name: string;
  /** Model size on disk in bytes. */
  readonly sizeBytes: number;
  /** Active context/sequence length. */
  readonly maxSequenceLength: number;
  /** Quantization format (e.g., "4bit", "8bit", "bf16"). */
  readonly quantization: string;
  /** Model architecture (e.g., "qwen3", "llama", "mistral"). */
  readonly architecture: string;
  /** Parameter count if available (e.g., "8B"). */
  readonly parameters?: string;
  /** Whether model uses grouped-query attention. */
  readonly usesGQA?: boolean;
}

/**
 * MLX-specific memory information.
 *
 * On Apple Silicon, unified memory means RAM and VRAM are the same pool.
 */
export interface MLXMemoryInfo {
  /** Active memory used by MLX in bytes. */
  readonly activeBytes: number;
  /** Peak memory used by MLX in bytes. */
  readonly peakBytes: number;
  /** Cache memory used by MLX in bytes. */
  readonly cacheBytes: number;
  /** Total unified memory available in bytes. */
  readonly totalUnifiedMemoryBytes: number;
}

/**
 * Apple Silicon chip information.
 */
export interface AppleSiliconInfo {
  /** Chip name (e.g., "Apple M2 Pro", "Apple M4 Max"). */
  readonly chipName: string;
  /** Number of GPU cores. */
  readonly gpuCores: number;
  /** Number of Neural Engine cores. */
  readonly neuralEngineCores: number;
  /** Total unified memory in bytes. */
  readonly unifiedMemoryBytes: number;
  /** Memory bandwidth in GB/s. */
  readonly memoryBandwidthGBs: number;
}

/**
 * MLX Engine interface.
 *
 * Direct inference using Apple's MLX framework on Apple Silicon.
 * No HTTP server - all calls through Tauri IPC.
 *
 * Key differences from GGUF-based engines:
 * - Uses safetensors format from mlx-community
 * - Leverages unified memory (no CPU<->GPU copies)
 * - Native Metal GPU acceleration
 * - Often faster than GGUF on Apple Silicon
 *
 * Extends Engine with model lifecycle management.
 */
export interface MLXEngine extends Engine {
  /**
   * Load an MLX model from HuggingFace or local path.
   *
   * Supports both HuggingFace model IDs (e.g., "mlx-community/Qwen3-8B-4bit")
   * and local paths to already-downloaded models.
   *
   * Only one model can be loaded at a time. Loading a new model
   * automatically unloads the previous one.
   *
   * @param modelIdOrPath - HuggingFace model ID or local path
   * @param options - Loading configuration
   */
  loadModel(modelIdOrPath: string, options?: MLXLoadOptions): Promise<Result<void>>;

  /**
   * Unload the current model and free resources.
   */
  unloadModel(): Promise<Result<void>>;

  /**
   * Check if a model is currently loaded.
   */
  isModelLoaded(): boolean;

  /**
   * Get information about the currently loaded model.
   * Returns null if no model is loaded.
   */
  getLoadedModel(): MLXLoadedModelInfo | null;

  /**
   * Get current MLX memory usage.
   */
  getMemoryUsage(): Promise<MLXMemoryInfo>;

  /**
   * Get Apple Silicon chip information.
   * Returns null if not running on Apple Silicon.
   */
  getAppleSiliconInfo(): Promise<AppleSiliconInfo | null>;

  /**
   * Check if running on Apple Silicon.
   */
  isAppleSilicon(): Promise<boolean>;

  /**
   * Cancel any in-progress generation.
   */
  cancelGeneration(): Promise<void>;

  /**
   * Clear the MLX memory cache.
   * Useful for freeing memory between operations.
   */
  clearCache(): Promise<void>;
}

/**
 * Tauri command names for the MLX engine plugin.
 *
 * These map to Rust functions in the Tauri plugin.
 */
export const MLXTauriCommands = {
  /** Load a model from HuggingFace or local path. */
  loadModel: 'plugin:mlx-engine|load_model',
  /** Unload current model. */
  unloadModel: 'plugin:mlx-engine|unload_model',
  /** Get loaded model info. */
  getLoadedModel: 'plugin:mlx-engine|get_loaded_model',
  /** Check if model is loaded. */
  isModelLoaded: 'plugin:mlx-engine|is_model_loaded',
  /** Get memory usage. */
  getMemoryUsage: 'plugin:mlx-engine|get_memory_usage',
  /** Get Apple Silicon info. */
  getAppleSiliconInfo: 'plugin:mlx-engine|get_apple_silicon_info',
  /** Check if Apple Silicon. */
  isAppleSilicon: 'plugin:mlx-engine|is_apple_silicon',
  /** Chat completion (non-streaming). */
  chat: 'plugin:mlx-engine|chat',
  /** Text completion (non-streaming). */
  complete: 'plugin:mlx-engine|complete',
  /** Generate embeddings. */
  embed: 'plugin:mlx-engine|embed',
  /** Cancel current generation. */
  cancel: 'plugin:mlx-engine|cancel',
  /** Get engine status. */
  getStatus: 'plugin:mlx-engine|get_status',
  /** Clear memory cache. */
  clearCache: 'plugin:mlx-engine|clear_cache',
} as const;

/**
 * Tauri event names for MLX streaming responses.
 */
export const MLXTauriEvents = {
  /** Token stream during generation. */
  stream: 'mlx-engine:stream',
  /** Model loading/download progress. */
  loadProgress: 'mlx-engine:load-progress',
} as const;

/**
 * Query keys for MLX Engine React Query integration.
 */
export const MLXEngineQueryKeys = {
  all: ['mlx-engine'] as const,
  status: () => [...MLXEngineQueryKeys.all, 'status'] as const,
  loadedModel: () => [...MLXEngineQueryKeys.all, 'loaded-model'] as const,
  memory: () => [...MLXEngineQueryKeys.all, 'memory'] as const,
  appleSilicon: () => [...MLXEngineQueryKeys.all, 'apple-silicon'] as const,
} as const;
