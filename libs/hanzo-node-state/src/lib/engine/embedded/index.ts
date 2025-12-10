/**
 * Embedded Engines - Direct inference via Tauri plugins.
 *
 * These engines run models directly in the Tauri app without an HTTP server.
 * All calls go through Tauri IPC.
 *
 * ## Hanzo Engine (GGUF models)
 * - Rust library wrapping mistral.rs
 * - Uses Candle ML framework
 * - GPU acceleration via Metal (macOS) or CUDA
 * - Supports GGUF quantized models
 *
 * ## MLX Engine (Apple Silicon only)
 * - Uses Apple's MLX framework
 * - Native Metal GPU acceleration
 * - Unified memory (no CPU<->GPU copies)
 * - Models from mlx-community on HuggingFace
 * - Often faster than GGUF on Mac
 *
 * Usage - Hanzo Engine:
 * ```typescript
 * import { invoke } from '@tauri-apps/api/core';
 * import { listen } from '@tauri-apps/api/event';
 * import { createHanzoEngine } from './engine/embedded';
 *
 * const engine = createHanzoEngine({ invoke, listen });
 * await engine.loadModel('/path/to/model.gguf', { gpuLayers: -1 });
 * ```
 *
 * Usage - MLX Engine (Apple Silicon):
 * ```typescript
 * import { createMLXEngine } from './engine/embedded';
 *
 * const engine = createMLXEngine({ invoke, listen });
 * if (await engine.isAppleSilicon()) {
 *   await engine.loadModel('mlx-community/Qwen3-8B-4bit');
 * }
 * ```
 */

// Types - Hanzo Engine (GGUF/mistral.rs)
export type {
  EmbeddedEngine,
  GpuInfo,
  LoadedModelInfo,
  LoadOptions,
  MemoryInfo,
  StreamEvent,
} from './types';

export { EmbeddedEngineQueryKeys, TauriCommands, TauriEvents } from './types';

// Types - MLX Engine (Apple Silicon)
export type {
  AppleSiliconInfo,
  MLXEngine,
  MLXLoadedModelInfo,
  MLXLoadOptions,
  MLXMemoryInfo,
} from './types';

export { MLXEngineQueryKeys, MLXTauriCommands, MLXTauriEvents } from './types';

// Implementation - Hanzo Engine
export { createHanzoEngine, HanzoEngine } from './hanzo-engine';
export type { HanzoEngineConfig } from './hanzo-engine';

// Implementation - MLX Engine
export { createMLXEngine, MLXEngineImpl } from './mlx-engine';
export type { MLXEngineConfig } from './mlx-engine';
