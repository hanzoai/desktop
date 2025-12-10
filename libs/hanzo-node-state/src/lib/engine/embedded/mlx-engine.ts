/**
 * MLXEngine - Embedded inference engine for Apple Silicon.
 *
 * Uses Apple's MLX framework for native Metal GPU acceleration.
 * Only works on Apple Silicon Macs (M1/M2/M3/M4).
 *
 * Architecture:
 * - Tauri plugin wraps mlx-lm Python bindings via PyO3
 * - Uses MLX C++ core with Metal shaders
 * - Unified memory = no CPU<->GPU copies
 * - Models from mlx-community on HuggingFace (safetensors format)
 *
 * Key advantages over GGUF:
 * - Native Apple Silicon optimization
 * - Better memory efficiency with unified memory
 * - Often faster inference on Mac
 */

import type {
  ChatChunk,
  ChatOptions,
  CompleteOptions,
  EngineStatus,
  Message,
  Model,
  Result,
} from '../types';
import type {
  AppleSiliconInfo,
  MLXEngine,
  MLXLoadedModelInfo,
  MLXLoadOptions,
  MLXMemoryInfo,
  StreamEvent,
} from './types';
import { MLXTauriCommands, MLXTauriEvents } from './types';

/**
 * Tauri invoke function type.
 */
type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Tauri event listener type.
 */
type TauriListen = <T>(
  event: string,
  handler: (event: { payload: T }) => void,
) => Promise<() => void>;

/**
 * Configuration for creating an MLXEngine instance.
 */
export interface MLXEngineConfig {
  /** Tauri invoke function. Pass from @tauri-apps/api/core. */
  readonly invoke: TauriInvoke;
  /** Tauri event listener. Pass from @tauri-apps/api/event. */
  readonly listen: TauriListen;
}

/**
 * MLXEngineImpl implementation.
 *
 * Provides direct inference through Apple's MLX framework.
 * Single model loaded at a time due to memory constraints.
 *
 * Platform requirement: macOS with Apple Silicon (M1/M2/M3/M4).
 */
export class MLXEngineImpl implements MLXEngine {
  readonly id = 'mlx-engine';
  readonly name = 'MLX Engine';
  readonly baseUrl = 'tauri://mlx-engine';
  readonly apiKey = undefined;
  readonly defaultModel = undefined;

  private readonly invoke: TauriInvoke;
  private readonly listen: TauriListen;
  private loadedModel: MLXLoadedModelInfo | null = null;
  private generationAbortController: AbortController | null = null;

  constructor(config: MLXEngineConfig) {
    this.invoke = config.invoke;
    this.listen = config.listen;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Engine interface
  // ─────────────────────────────────────────────────────────────────────────────

  async getStatus(): Promise<EngineStatus> {
    try {
      // First check if we're on Apple Silicon
      const isAppleSilicon = await this.isAppleSilicon();
      if (!isAppleSilicon) {
        return {
          available: false,
          ready: false,
          error: 'MLX requires Apple Silicon (M1/M2/M3/M4)',
        };
      }

      const status = await this.invoke<{
        available: boolean;
        ready: boolean;
        version?: string;
        modelLoaded: boolean;
      }>(MLXTauriCommands.getStatus);

      return {
        available: status.available,
        ready: status.ready && status.modelLoaded,
        version: status.version,
      };
    } catch (err) {
      return {
        available: false,
        ready: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listModels(): Promise<Model[]> {
    // MLX engine loads models from HuggingFace or local paths.
    // Return the currently loaded model if any.
    if (this.loadedModel) {
      return [
        {
          id: this.loadedModel.modelId,
          name: this.loadedModel.name,
          ownedBy: 'mlx-community',
        },
      ];
    }
    return [];
  }

  async *chat(
    messages: readonly Message[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    if (!this.loadedModel) {
      throw new Error('No model loaded. Call loadModel() first.');
    }

    this.generationAbortController = new AbortController();
    const signal = this.generationAbortController.signal;

    // Set up event listener for streaming tokens
    const tokenQueue: StreamEvent[] = [];
    let resolveNext: ((value: StreamEvent | null) => void) | null = null;
    let listenerCleanup: (() => void) | null = null;

    const unlisten = await this.listen<StreamEvent>(
      MLXTauriEvents.stream,
      (event) => {
        if (resolveNext) {
          resolveNext(event.payload);
          resolveNext = null;
        } else {
          tokenQueue.push(event.payload);
        }
      },
    );
    listenerCleanup = unlisten;

    try {
      // Start chat completion (will emit stream events)
      const chatPromise = this.invoke<void>(MLXTauriCommands.chat, {
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        stop: options?.stop ? [...options.stop] : undefined,
      });

      // Yield tokens as they arrive
      while (!signal.aborted) {
        const event = await new Promise<StreamEvent | null>((resolve) => {
          if (tokenQueue.length > 0) {
            resolve(tokenQueue.shift()!);
          } else {
            resolveNext = resolve;
          }
        });

        if (!event || signal.aborted) break;

        if (event.type === 'token' && event.content) {
          yield { content: event.content };
        } else if (event.type === 'done') {
          yield {
            content: '',
            finishReason: event.finishReason ?? 'stop',
          };
          break;
        } else if (event.type === 'error') {
          throw new Error(event.error ?? 'Unknown generation error');
        }
      }

      await chatPromise;
    } finally {
      this.generationAbortController = null;
      if (listenerCleanup) {
        listenerCleanup();
      }
    }
  }

  async complete(prompt: string, options?: CompleteOptions): Promise<string> {
    if (!this.loadedModel) {
      throw new Error('No model loaded. Call loadModel() first.');
    }

    return this.invoke<string>(MLXTauriCommands.complete, {
      prompt,
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      stop: options?.stop ? [...options.stop] : undefined,
    });
  }

  async embed(
    input: string | readonly string[],
    _model?: string,
  ): Promise<number[][]> {
    if (!this.loadedModel) {
      throw new Error('No model loaded. Call loadModel() first.');
    }

    const texts = typeof input === 'string' ? [input] : [...input];
    return this.invoke<number[][]>(MLXTauriCommands.embed, {
      input: texts,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MLXEngine interface
  // ─────────────────────────────────────────────────────────────────────────────

  async loadModel(
    modelIdOrPath: string,
    options?: MLXLoadOptions,
  ): Promise<Result<void>> {
    try {
      // Check platform first
      const isAppleSilicon = await this.isAppleSilicon();
      if (!isAppleSilicon) {
        return {
          ok: false,
          error: 'MLX requires Apple Silicon (M1/M2/M3/M4)',
        };
      }

      const info = await this.invoke<MLXLoadedModelInfo>(MLXTauriCommands.loadModel, {
        modelIdOrPath,
        maxSequenceLength: options?.maxSequenceLength,
        memoryLimit: options?.memoryLimit,
        quantize4bit: options?.quantize4bit,
        prefillChunkSize: options?.prefillChunkSize ?? 512,
        speculativeDecoding: options?.speculativeDecoding ?? false,
      });
      this.loadedModel = info;
      return { ok: true, value: undefined };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async unloadModel(): Promise<Result<void>> {
    try {
      await this.invoke<void>(MLXTauriCommands.unloadModel);
      this.loadedModel = null;
      return { ok: true, value: undefined };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  isModelLoaded(): boolean {
    return this.loadedModel !== null;
  }

  getLoadedModel(): MLXLoadedModelInfo | null {
    return this.loadedModel;
  }

  async getMemoryUsage(): Promise<MLXMemoryInfo> {
    return this.invoke<MLXMemoryInfo>(MLXTauriCommands.getMemoryUsage);
  }

  async getAppleSiliconInfo(): Promise<AppleSiliconInfo | null> {
    return this.invoke<AppleSiliconInfo | null>(MLXTauriCommands.getAppleSiliconInfo);
  }

  async isAppleSilicon(): Promise<boolean> {
    try {
      return await this.invoke<boolean>(MLXTauriCommands.isAppleSilicon);
    } catch {
      return false;
    }
  }

  async cancelGeneration(): Promise<void> {
    if (this.generationAbortController) {
      this.generationAbortController.abort();
    }
    await this.invoke<void>(MLXTauriCommands.cancel);
  }

  async clearCache(): Promise<void> {
    await this.invoke<void>(MLXTauriCommands.clearCache);
  }
}

/**
 * Create an MLXEngine instance.
 *
 * MLX is Apple's ML framework optimized for Apple Silicon.
 * Only works on M1/M2/M3/M4 Macs.
 *
 * Usage:
 * ```typescript
 * import { invoke } from '@tauri-apps/api/core';
 * import { listen } from '@tauri-apps/api/event';
 *
 * const engine = createMLXEngine({ invoke, listen });
 *
 * // Check platform support
 * if (!(await engine.isAppleSilicon())) {
 *   console.error('MLX requires Apple Silicon');
 *   return;
 * }
 *
 * // Load a model from mlx-community
 * const result = await engine.loadModel('mlx-community/Qwen3-8B-4bit');
 * if (!result.ok) {
 *   console.error('Failed to load:', result.error);
 *   return;
 * }
 *
 * // Chat with streaming
 * for await (const chunk of engine.chat([{ role: 'user', content: 'Hello' }])) {
 *   process.stdout.write(chunk.content);
 * }
 *
 * // Unload when done
 * await engine.unloadModel();
 * ```
 */
export function createMLXEngine(config: MLXEngineConfig): MLXEngine {
  return new MLXEngineImpl(config);
}
