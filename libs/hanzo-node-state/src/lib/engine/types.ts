/**
 * Engine - Generic inference endpoint interface.
 *
 * An Engine is just "something I can send chat messages to."
 * All engines expose an OpenAI-compatible API (or adapter).
 *
 * Deployment details (embedded/sidecar/external) are secondary
 * concerns handled by extended interfaces.
 */

/**
 * Message role in a chat conversation.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Chat message.
 */
export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  readonly toolCallId?: string;
  readonly name?: string;
}

/**
 * Streaming chat chunk.
 */
export interface ChatChunk {
  readonly content: string;
  readonly finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  readonly toolCalls?: readonly ToolCall[];
}

/**
 * Tool/function call from the model.
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
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
  readonly tools?: readonly ToolDefinition[];
  readonly responseFormat?: { type: 'text' | 'json_object' };
  readonly timeout?: number;
}

/**
 * Text completion options.
 */
export interface CompleteOptions {
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
  readonly timeout?: number;
}

/**
 * Model information.
 */
export interface Model {
  readonly id: string;
  readonly name: string;
  readonly ownedBy?: string;
  readonly created?: number;
}

/**
 * Engine - Generic inference endpoint.
 *
 * Works with any OpenAI-compatible server:
 * - OpenAI, Anthropic (via adapter), Groq
 * - Ollama, LM Studio, vLLM, TGI
 * - Hanzo Gateway, Hanzo Node
 * - Any OpenAI-compatible server
 */
export interface Engine {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;

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
  complete(prompt: string, options?: CompleteOptions): Promise<string>;

  /**
   * Generate embeddings.
   */
  embed(input: string | readonly string[], model?: string): Promise<number[][]>;

  /**
   * List available models.
   */
  listModels(): Promise<Model[]>;
}

/**
 * Engine configuration for creating instances.
 */
export interface EngineConfig {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly defaultModel?: string;
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
}

/**
 * Result type for fallible operations.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * Engine status.
 */
export interface EngineStatus {
  readonly available: boolean;
  readonly ready: boolean;
  readonly version?: string;
  readonly error?: string;
}

/**
 * Parse SSE stream for chat completions.
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<ChatChunk, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const choice = json.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta ?? {};
          const content = delta.content ?? '';
          const finishReason = choice.finish_reason;

          let toolCalls: ToolCall[] | undefined;
          if (delta.tool_calls) {
            toolCalls = delta.tool_calls.map(
              (tc: Record<string, unknown>) => ({
                id: tc.id as string,
                type: 'function' as const,
                function: {
                  name: (tc.function as Record<string, unknown>)?.name as string,
                  arguments: (tc.function as Record<string, unknown>)
                    ?.arguments as string,
                },
              }),
            );
          }

          yield {
            content,
            finishReason: finishReason as ChatChunk['finishReason'],
            toolCalls,
          };
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Base Engine implementation for OpenAI-compatible APIs.
 */
export class OpenAICompatibleEngine implements Engine {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;

  protected readonly defaultModel?: string;
  protected readonly headers: Record<string, string>;
  protected readonly timeout: number;

  constructor(config: EngineConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.timeout = config.timeout ?? 30000;

    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (this.apiKey) {
      this.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
  }

  protected async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...this.headers, ...options.headers },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *chat(
    messages: readonly Message[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const model = options?.model ?? this.defaultModel;
    if (!model) {
      yield { content: '', finishReason: 'stop' };
      return;
    }

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId && { tool_call_id: m.toolCallId }),
        ...(m.name && { name: m.name }),
      })),
      stream: true,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stop) body.stop = options.stop;
    if (options?.tools) body.tools = options.tools;
    if (options?.responseFormat) body.response_format = options.responseFormat;

    const timeout = options?.timeout ?? this.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        yield { content: `Error: HTTP ${response.status}`, finishReason: 'stop' };
        return;
      }

      yield* parseSSEStream(response);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { content: `Error: ${msg}`, finishReason: 'stop' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async complete(prompt: string, options?: CompleteOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    if (!model) throw new Error('No model specified');

    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stop) body.stop = options.stop;

    const response = await this.fetch('/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.text ?? '';
  }

  async embed(input: string | readonly string[], model?: string): Promise<number[][]> {
    const effectiveModel = model ?? this.defaultModel;
    if (!effectiveModel) throw new Error('No model specified');

    const response = await this.fetch('/embeddings', {
      method: 'POST',
      body: JSON.stringify({
        model: effectiveModel,
        input: Array.isArray(input) ? input : [input],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return (data.data ?? [])
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((e: { embedding: number[] }) => e.embedding);
  }

  async listModels(): Promise<Model[]> {
    const response = await this.fetch('/models');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return (data.data ?? []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: (m.id as string).split('/').pop() ?? (m.id as string),
      ownedBy: m.owned_by as string | undefined,
      created: m.created as number | undefined,
    }));
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const response = await this.fetch('/models');
      if (!response.ok) {
        return {
          available: false,
          ready: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
      return { available: true, ready: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { available: false, ready: false, error: msg };
    }
  }
}

/**
 * Create an Engine from configuration.
 */
export function createEngine(config: EngineConfig): Engine {
  return new OpenAICompatibleEngine(config);
}

/**
 * Query keys for React Query integration.
 */
export const EngineQueryKeys = {
  all: ['engine'] as const,
  list: () => [...EngineQueryKeys.all, 'list'] as const,
  detail: (id: string) => [...EngineQueryKeys.all, id] as const,
  status: (id: string) => [...EngineQueryKeys.detail(id), 'status'] as const,
  models: (id: string) => [...EngineQueryKeys.detail(id), 'models'] as const,
} as const;
