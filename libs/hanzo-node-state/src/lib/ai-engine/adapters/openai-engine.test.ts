/**
 * Tests for OpenAI Engine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  OpenAIEngine,
  createOpenAIEngine,
  createOpenAI,
  createOllama,
  createLMStudio,
  createHanzoGateway,
} from './openai-engine';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAIEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates engine with correct properties', () => {
      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test Engine',
        baseUrl: 'http://localhost:8000/v1',
        apiKey: 'test-key',
        defaultModel: 'gpt-4',
      });

      expect(engine.id).toBe('test');
      expect(engine.name).toBe('Test Engine');
      expect(engine.baseUrl).toBe('http://localhost:8000/v1');
      expect(engine.apiKey).toBe('test-key');
      expect(engine.defaultModel).toBe('gpt-4');
    });

    it('removes trailing slash from baseUrl', () => {
      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1/',
      });

      expect(engine.baseUrl).toBe('http://localhost:8000/v1');
    });
  });

  describe('getStatus', () => {
    it('returns available when models endpoint succeeds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
      });

      const result = await engine.getStatus();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
        expect(result.value.ready).toBe(true);
      }
    });

    it('returns unavailable when models endpoint fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
      });

      const result = await engine.getStatus();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(false);
        expect(result.value.ready).toBe(false);
        expect(result.value.error).toContain('500');
      }
    });

    it('returns unavailable on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
      });

      const result = await engine.getStatus();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(false);
        expect(result.value.error).toBe('Network error');
      }
    });
  });

  describe('listModels', () => {
    it('returns models from API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'gpt-4', owned_by: 'openai', created: 1234567890 },
              { id: 'gpt-3.5-turbo', owned_by: 'openai' },
            ],
          }),
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
      });

      const result = await engine.listModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].id).toBe('gpt-4');
        expect(result.value[0].ownedBy).toBe('openai');
        expect(result.value[0].created).toBe(1234567890);
      }
    });

    it('returns error on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
      });

      const result = await engine.listModels();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('401');
      }
    });
  });

  describe('complete', () => {
    it('returns completion text', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ text: 'Hello, world!' }],
          }),
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
        defaultModel: 'gpt-4',
      });

      const result = await engine.complete('Say hello');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Hello, world!');
      }
    });

    it('returns error when no model specified', async () => {
      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
      });

      const result = await engine.complete('Say hello');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('No model specified');
      }
    });
  });

  describe('embed', () => {
    it('returns embeddings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { index: 0, embedding: [0.1, 0.2, 0.3] },
              { index: 1, embedding: [0.4, 0.5, 0.6] },
            ],
          }),
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
        defaultModel: 'text-embedding-ada-002',
      });

      const result = await engine.embed(['hello', 'world']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]).toEqual([0.1, 0.2, 0.3]);
        expect(result.value[1]).toEqual([0.4, 0.5, 0.6]);
      }
    });

    it('handles single string input', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          }),
      });

      const engine = createOpenAIEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1',
        defaultModel: 'text-embedding-ada-002',
      });

      const result = await engine.embed('hello');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });
  });
});

describe('factory functions', () => {
  it('createOpenAI creates OpenAI engine', () => {
    const engine = createOpenAI('sk-test-key', 'gpt-4o');

    expect(engine.id).toBe('openai');
    expect(engine.name).toBe('OpenAI');
    expect(engine.baseUrl).toBe('https://api.openai.com/v1');
    expect(engine.apiKey).toBe('sk-test-key');
    expect(engine.defaultModel).toBe('gpt-4o');
  });

  it('createOllama creates Ollama engine', () => {
    const engine = createOllama('http://localhost:11434', 'llama3');

    expect(engine.id).toBe('ollama');
    expect(engine.name).toBe('Ollama');
    expect(engine.baseUrl).toBe('http://localhost:11434/v1');
    expect(engine.defaultModel).toBe('llama3');
    expect(engine.apiKey).toBeUndefined();
  });

  it('createLMStudio creates LM Studio engine', () => {
    const engine = createLMStudio('http://localhost:1234');

    expect(engine.id).toBe('lmstudio');
    expect(engine.name).toBe('LM Studio');
    expect(engine.baseUrl).toBe('http://localhost:1234/v1');
    expect(engine.apiKey).toBeUndefined();
  });

  it('createHanzoGateway creates Hanzo Gateway engine', () => {
    const engine = createHanzoGateway('hanzo-api-key', 'claude-3-opus');

    expect(engine.id).toBe('hanzo-gateway');
    expect(engine.name).toBe('Hanzo Gateway');
    expect(engine.baseUrl).toBe('https://api.hanzo.ai/v1');
    expect(engine.apiKey).toBe('hanzo-api-key');
    expect(engine.defaultModel).toBe('claude-3-opus');
  });
});
