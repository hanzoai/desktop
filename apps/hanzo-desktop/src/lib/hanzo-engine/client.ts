/**
 * Engine Client
 *
 * HTTP client for the local inference engine.
 * Defaults to hanzo-engine on 36900 (OpenAI / Anthropic compatible).
 * Override with VITE_ENGINE_BASE_URL=… to point at zen5-server (8000)
 * or a remote endpoint.
 */

import type {
  EngineStatus,
  LoadModelOptions,
  ChatMessage,
  ChatCompletionResponse,
  ChatCompletionRequest,
  ModelsResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from './types';

// Default engine endpoint. Brand-neutral name (was HANZO_ENGINE_BASE_URL).
// Re-exported as the legacy name for back-compat with existing call sites.
export const ENGINE_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ENGINE_BASE_URL) ||
  'http://127.0.0.1:36900';

/** @deprecated Use ENGINE_BASE_URL. Kept for one release. */
export const HANZO_ENGINE_BASE_URL = ENGINE_BASE_URL;

/**
 * Engine API client. Class name preserved for now to avoid sweeping
 * call-site renames; introduce `EngineClient` alias before deprecating
 * the `Hanzo`-prefixed name.
 */
export class HanzoEngineClient {
  private baseUrl: string;

  constructor(baseUrl: string = ENGINE_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get engine status (model loaded, device, etc.)
   */
  async getStatus(): Promise<EngineStatus> {
    const response = await fetch(`${this.baseUrl}/v1/engine/status`);
    if (!response.ok) {
      throw new Error(`Failed to get engine status: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * List available/loaded models
   */
  async listModels(): Promise<ModelsResponse> {
    const response = await fetch(`${this.baseUrl}/v1/engine/models`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Load a model into the engine
   */
  async loadModel(options: LoadModelOptions): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/engine/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to load model: ${response.statusText}`);
    }
  }

  /**
   * Unload the current model
   */
  async unloadModel(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/engine/unload`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`Failed to unload model: ${response.statusText}`);
    }
  }

  /**
   * Send a chat completion request (non-streaming)
   */
  async chat(
    messages: ChatMessage[],
    model = 'default',
    options?: { temperature?: number; max_tokens?: number; top_p?: number }
  ): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
      model,
      messages,
      stream: false,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/v1/engine/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Chat request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send a streaming chat completion request
   * Returns an async generator that yields content chunks
   */
  async *streamChat(
    messages: ChatMessage[],
    model = 'default',
    options?: { temperature?: number; max_tokens?: number; top_p?: number }
  ): AsyncGenerator<string, void, unknown> {
    const request: ChatCompletionRequest = {
      model,
      messages,
      stream: true,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/v1/engine/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Stream request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Generate embeddings for text
   */
  async embeddings(
    input: string | string[],
    model = 'default'
  ): Promise<EmbeddingResponse> {
    const request: EmbeddingRequest = { model, input };

    const response = await fetch(`${this.baseUrl}/v1/engine/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Embedding request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if the engine server is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/engine/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Default client instance
export const hanzoEngine = new HanzoEngineClient();
