/**
 * OpenAI-compatible AI Engine implementation.
 *
 * Works with any server implementing the OpenAI API:
 * - OpenAI API
 * - Ollama (with /v1 prefix)
 * - LM Studio
 * - vLLM
 * - text-generation-inference
 * - Any OpenAI-compatible server
 *
 * Design:
 * - Pure fetch-based, no external dependencies
 * - Streaming via SSE parsing
 * - Explicit error handling with Result type
 */

import {
  type AIEngine,
  type ChatChunk,
  type ChatOptions,
  type CompleteOptions,
  type EngineStatus,
  type Message,
  type Model,
  type Result,
  type ToolCall,
} from '../types';

/**
 * Configuration for OpenAI-compatible engine.
 */
export interface OpenAIEngineConfig {
  /** Unique identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Base URL (e.g., "https://api.openai.com/v1") */
  readonly baseUrl: string;
  /** API key (optional for local engines) */
  readonly apiKey?: string;
  /** Default model to use */
  readonly defaultModel?: string;
  /** Custom headers */
  readonly headers?: Record<string, string>;
  /** Request timeout in ms */
  readonly timeout?: number;
}

/**
 * Parse SSE stream for chat completions.
 */
async function* parseSSEStream(
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

          // Parse tool calls if present
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
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * OpenAI-compatible AI Engine.
 */
export class OpenAIEngine implements AIEngine {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly defaultModel?: string;

  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(config: OpenAIEngineConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
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

  /**
   * Make a fetch request with timeout and error handling.
   */
  private async fetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...this.headers, ...options.headers },
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getStatus(): Promise<Result<EngineStatus>> {
    try {
      const response = await this.fetch('/models');

      if (!response.ok) {
        return {
          ok: true,
          value: {
            available: false,
            ready: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      return {
        ok: true,
        value: {
          available: true,
          ready: true,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: true,
        value: {
          available: false,
          ready: false,
          error: message,
        },
      };
    }
  }

  async listModels(): Promise<Result<readonly Model[]>> {
    try {
      const response = await this.fetch('/models');

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const models: Model[] = (data.data ?? []).map(
        (m: Record<string, unknown>) => ({
          id: m.id as string,
          name: (m.id as string).split('/').pop() ?? (m.id as string),
          ownedBy: m.owned_by as string | undefined,
          created: m.created as number | undefined,
        }),
      );

      return { ok: true, value: models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }

  async *chat(
    messages: readonly Message[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const model = options?.model ?? this.defaultModel;
    if (!model) {
      yield {
        content: '',
        finishReason: 'stop',
      };
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

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options?.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (options?.stop) {
      body.stop = options.stop;
    }
    if (options?.tools) {
      body.tools = options.tools;
    }
    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }

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
        yield {
          content: `Error: HTTP ${response.status} - ${response.statusText}`,
          finishReason: 'stop',
        };
        return;
      }

      yield* parseSSEStream(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      yield {
        content: `Error: ${message}`,
        finishReason: 'stop',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async complete(
    prompt: string,
    options?: CompleteOptions,
  ): Promise<Result<string>> {
    const model = options?.model ?? this.defaultModel;
    if (!model) {
      return { ok: false, error: 'No model specified' };
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options?.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (options?.stop) {
      body.stop = options.stop;
    }

    try {
      const response = await this.fetch('/completions', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.text ?? '';
      return { ok: true, value: text };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }

  async embed(
    input: string | readonly string[],
    model?: string,
  ): Promise<Result<readonly number[][]>> {
    const effectiveModel = model ?? this.defaultModel;
    if (!effectiveModel) {
      return { ok: false, error: 'No model specified' };
    }

    const body = {
      model: effectiveModel,
      input: Array.isArray(input) ? input : [input],
    };

    try {
      const response = await this.fetch('/embeddings', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const embeddings: number[][] = (data.data ?? [])
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((e: { embedding: number[] }) => e.embedding);

      return { ok: true, value: embeddings };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }
}

/**
 * Create an OpenAI-compatible engine.
 */
export function createOpenAIEngine(config: OpenAIEngineConfig): OpenAIEngine {
  return new OpenAIEngine(config);
}

/**
 * Create an engine for OpenAI API.
 */
export function createOpenAI(apiKey: string, model?: string): OpenAIEngine {
  return new OpenAIEngine({
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey,
    defaultModel: model ?? 'gpt-4o',
  });
}

/**
 * Create an engine for local Ollama.
 */
export function createOllama(
  baseUrl = 'http://127.0.0.1:11434',
  model?: string,
): OpenAIEngine {
  return new OpenAIEngine({
    id: 'ollama',
    name: 'Ollama',
    baseUrl: `${baseUrl}/v1`,
    defaultModel: model,
  });
}

/**
 * Create an engine for LM Studio.
 */
export function createLMStudio(
  baseUrl = 'http://127.0.0.1:1234',
  model?: string,
): OpenAIEngine {
  return new OpenAIEngine({
    id: 'lmstudio',
    name: 'LM Studio',
    baseUrl: `${baseUrl}/v1`,
    defaultModel: model,
  });
}

/**
 * Create an engine for Hanzo Gateway.
 */
export function createHanzoGateway(
  apiKey: string,
  model?: string,
): OpenAIEngine {
  return new OpenAIEngine({
    id: 'hanzo-gateway',
    name: 'Hanzo Gateway',
    baseUrl: 'https://api.hanzo.ai/v1',
    apiKey,
    defaultModel: model,
  });
}
