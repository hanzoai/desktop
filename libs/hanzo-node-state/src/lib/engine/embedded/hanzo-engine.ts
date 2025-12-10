/**
 * HanzoEngine - Embedded inference engine implementation.
 *
 * Wraps the hanzo-engine Tauri plugin for direct GGUF model inference.
 * No HTTP server - all calls through Tauri IPC.
 *
 * Architecture:
 * - Tauri plugin written in Rust wraps mistral.rs
 * - Uses Candle ML framework
 * - GPU acceleration via Metal (macOS) or CUDA
 * - Streaming via Tauri events
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
  EmbeddedEngine,
  GpuInfo,
  LoadedModelInfo,
  LoadOptions,
  MemoryInfo,
  StreamEvent,
} from './types';
import { TauriCommands, TauriEvents } from './types';

/**
 * Tauri invoke function type.
 * We don't import @tauri-apps/api directly to avoid hard dependency.
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
 * Configuration for creating a HanzoEngine instance.
 */
export interface HanzoEngineConfig {
  /** Tauri invoke function. Pass from @tauri-apps/api/core. */
  readonly invoke: TauriInvoke;
  /** Tauri event listener. Pass from @tauri-apps/api/event. */
  readonly listen: TauriListen;
}

/**
 * HanzoEngine implementation.
 *
 * Provides direct inference through the Tauri plugin without HTTP.
 * Single model loaded at a time due to memory constraints.
 */
export class HanzoEngine implements EmbeddedEngine {
  readonly id = 'hanzo-engine';
  readonly name = 'Hanzo Engine';
  readonly baseUrl = 'tauri://hanzo-engine';
  readonly apiKey = undefined;
  readonly defaultModel = undefined;

  private readonly invoke: TauriInvoke;
  private readonly listen: TauriListen;
  private loadedModel: LoadedModelInfo | null = null;
  private generationAbortController: AbortController | null = null;

  constructor(config: HanzoEngineConfig) {
    this.invoke = config.invoke;
    this.listen = config.listen;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Engine interface
  // ─────────────────────────────────────────────────────────────────────────────

  async getStatus(): Promise<EngineStatus> {
    try {
      const status = await this.invoke<{
        available: boolean;
        ready: boolean;
        version?: string;
        modelLoaded: boolean;
      }>(TauriCommands.getStatus);

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
    // Embedded engine doesn't have a model list - models are loaded from files.
    // Return the currently loaded model if any.
    if (this.loadedModel) {
      return [
        {
          id: this.loadedModel.path,
          name: this.loadedModel.name,
          ownedBy: 'local',
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
      TauriEvents.stream,
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
      const chatPromise = this.invoke<void>(TauriCommands.chat, {
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

    return this.invoke<string>(TauriCommands.complete, {
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
    return this.invoke<number[][]>(TauriCommands.embed, {
      input: texts,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EmbeddedEngine interface
  // ─────────────────────────────────────────────────────────────────────────────

  async loadModel(
    modelPath: string,
    options?: LoadOptions,
  ): Promise<Result<void>> {
    try {
      const info = await this.invoke<LoadedModelInfo>(TauriCommands.loadModel, {
        path: modelPath,
        contextLength: options?.contextLength,
        gpuLayers: options?.gpuLayers,
        threads: options?.threads,
        flashAttention: options?.flashAttention,
        kvCache: options?.kvCache ?? true,
        prefixCacheN: options?.prefixCacheN ?? 16,
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
      await this.invoke<void>(TauriCommands.unloadModel);
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

  getLoadedModel(): LoadedModelInfo | null {
    return this.loadedModel;
  }

  async getMemoryUsage(): Promise<MemoryInfo> {
    return this.invoke<MemoryInfo>(TauriCommands.getMemoryUsage);
  }

  async getGpuInfo(): Promise<GpuInfo | null> {
    return this.invoke<GpuInfo | null>(TauriCommands.getGpuInfo);
  }

  async cancelGeneration(): Promise<void> {
    if (this.generationAbortController) {
      this.generationAbortController.abort();
    }
    await this.invoke<void>(TauriCommands.cancel);
  }
}

/**
 * Create a HanzoEngine instance.
 *
 * Usage:
 * ```typescript
 * import { invoke } from '@tauri-apps/api/core';
 * import { listen } from '@tauri-apps/api/event';
 *
 * const engine = createHanzoEngine({ invoke, listen });
 *
 * // Load a model
 * await engine.loadModel('/path/to/model.gguf', { gpuLayers: -1 });
 *
 * // Chat with streaming
 * for await (const chunk of engine.chat([{ role: 'user', content: 'Hello' }])) {
 *   process.stdout.write(chunk.content);
 * }
 * ```
 */
export function createHanzoEngine(config: HanzoEngineConfig): EmbeddedEngine {
  return new HanzoEngine(config);
}
