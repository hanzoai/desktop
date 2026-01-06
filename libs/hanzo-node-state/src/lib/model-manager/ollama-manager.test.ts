/**
 * Tests for OllamaModelManager.
 *
 * Uses mock fetch to simulate Ollama API responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaModelManager, createOllamaManager } from './ollama-manager';

// Mock fetch response helper
function mockFetch(response: unknown, options?: { ok?: boolean; status?: number }) {
  return vi.fn().mockResolvedValue({
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    statusText: options?.ok === false ? 'Bad Request' : 'OK',
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    body: null,
  });
}

// Mock streaming fetch for pull
function mockStreamingFetch(chunks: string[]) {
  let index = 0;
  const reader = {
    read: vi.fn().mockImplementation(() => {
      if (index >= chunks.length) {
        return Promise.resolve({ done: true, value: undefined });
      }
      const chunk = new TextEncoder().encode(chunks[index++] + '\n');
      return Promise.resolve({ done: false, value: chunk });
    }),
  };

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: { getReader: () => reader },
  });
}

describe('OllamaModelManager', () => {
  describe('constructor', () => {
    it('uses default host when not specified', () => {
      const manager = new OllamaModelManager();
      expect(manager.engineId).toBe('ollama');
    });

    it('accepts custom host', () => {
      const manager = new OllamaModelManager({ host: 'http://192.168.1.100:11434' });
      expect(manager.engineId).toBe('ollama');
    });
  });

  describe('getInstalledModels', () => {
    it('returns empty array when no models', async () => {
      const fetch = mockFetch({ models: [] });
      const manager = new OllamaModelManager({ fetch });

      const models = await manager.getInstalledModels();

      expect(models).toEqual([]);
      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/tags',
        expect.any(Object),
      );
    });

    it('transforms model list response', async () => {
      const fetch = mockFetch({
        models: [
          {
            name: 'llama3.1:8b',
            model: 'llama3.1:8b',
            modified_at: '2024-01-15T10:30:00Z',
            size: 4700000000,
            digest: 'abc123',
            details: {
              family: 'llama',
              parameter_size: '8B',
              quantization_level: 'Q4_0',
            },
          },
        ],
      });
      const manager = new OllamaModelManager({ fetch });

      const models = await manager.getInstalledModels();

      expect(models).toHaveLength(1);
      expect(models[0]).toEqual({
        id: 'llama3.1:8b',
        name: 'llama3.1',
        tag: '8b',
        sizeBytes: 4700000000,
        modifiedAt: expect.any(Date),
        digest: 'abc123',
        metadata: {
          family: 'llama',
          families: undefined,
          format: undefined,
          parameterSize: '8B',
          quantizationLevel: 'Q4_0',
          parentModel: undefined,
        },
      });
    });

    it('handles model without tag', async () => {
      const fetch = mockFetch({
        models: [
          {
            name: 'qwen3',
            model: 'qwen3',
            modified_at: '2024-01-15T10:30:00Z',
            size: 2500000000,
            digest: 'def456',
          },
        ],
      });
      const manager = new OllamaModelManager({ fetch });

      const models = await manager.getInstalledModels();

      expect(models[0].name).toBe('qwen3');
      expect(models[0].tag).toBe('latest');
    });

    it('throws on API error', async () => {
      const fetch = mockFetch({}, { ok: false, status: 500 });
      const manager = new OllamaModelManager({ fetch });

      await expect(manager.getInstalledModels()).rejects.toThrow('Failed to list models');
    });
  });

  describe('pullModel', () => {
    it('yields progress during download', async () => {
      const chunks = [
        '{"status": "pulling manifest"}',
        '{"status": "pulling abc123", "completed": 500000000, "total": 1000000000}',
        '{"status": "pulling abc123", "completed": 1000000000, "total": 1000000000}',
        '{"status": "verifying sha256 digest"}',
        '{"status": "success"}',
      ];
      const fetch = mockStreamingFetch(chunks);
      const manager = new OllamaModelManager({ fetch });

      const progress: unknown[] = [];
      for await (const p of manager.pullModel('llama3.1:8b')) {
        progress.push(p);
      }

      expect(progress.length).toBeGreaterThanOrEqual(3);
      expect(progress[progress.length - 1]).toEqual({
        status: 'complete',
        progress: 100,
      });
    });

    it('handles abort signal', async () => {
      const controller = new AbortController();
      const chunks = [
        '{"status": "pulling manifest"}',
        '{"status": "pulling abc123", "completed": 100000000, "total": 1000000000}',
      ];

      // Create a reader that throws AbortError after first chunk
      let readCount = 0;
      const reader = {
        read: vi.fn().mockImplementation(() => {
          if (readCount >= 1) {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            return Promise.reject(error);
          }
          const chunk = new TextEncoder().encode(chunks[readCount++] + '\n');
          return Promise.resolve({ done: false, value: chunk });
        }),
      };

      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
      });

      const manager = new OllamaModelManager({ fetch });

      const progress: unknown[] = [];
      for await (const p of manager.pullModel('llama3.1:8b', { signal: controller.signal })) {
        progress.push(p);
        if (progress.length === 1) {
          controller.abort();
        }
      }

      const lastProgress = progress[progress.length - 1] as { status: string };
      expect(lastProgress.status).toBe('error');
    });
  });

  describe('removeModel', () => {
    it('calls delete endpoint', async () => {
      const fetch = mockFetch({});
      const manager = new OllamaModelManager({ fetch });

      await manager.removeModel('llama3.1:8b');

      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/delete',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ name: 'llama3.1:8b' }),
        }),
      );
    });

    it('throws on API error', async () => {
      const fetch = mockFetch({ error: 'model not found' }, { ok: false, status: 404 });
      const manager = new OllamaModelManager({ fetch });

      await expect(manager.removeModel('nonexistent:latest')).rejects.toThrow(
        'Failed to remove model',
      );
    });
  });

  describe('isModelInstalled', () => {
    it('returns true when model exists', async () => {
      const fetch = mockFetch({
        models: [{ name: 'llama3.1:8b', modified_at: '2024-01-15', size: 1000, digest: 'abc' }],
      });
      const manager = new OllamaModelManager({ fetch });

      const installed = await manager.isModelInstalled('llama3.1:8b');

      expect(installed).toBe(true);
    });

    it('returns false when model not found', async () => {
      const fetch = mockFetch({ models: [] });
      const manager = new OllamaModelManager({ fetch });

      const installed = await manager.isModelInstalled('nonexistent:latest');

      expect(installed).toBe(false);
    });
  });

  describe('getModelInfo', () => {
    it('returns null for non-installed model', async () => {
      const fetch = mockFetch({ models: [] });
      const manager = new OllamaModelManager({ fetch });

      const info = await manager.getModelInfo('nonexistent:latest');

      expect(info).toBeNull();
    });

    it('returns model info with details', async () => {
      // First call for list, second for show
      let callCount = 0;
      const fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: [{
                name: 'llama3.1:8b',
                modified_at: '2024-01-15',
                size: 4700000000,
                digest: 'abc123',
                details: { family: 'llama', parameter_size: '8B' },
              }],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            license: 'MIT',
            template: '{{ .Prompt }}',
            details: {
              family: 'llama',
              parameter_size: '8B',
              quantization_level: 'Q4_0',
            },
          }),
        });
      });

      const manager = new OllamaModelManager({ fetch });

      const info = await manager.getModelInfo('llama3.1:8b');

      expect(info).not.toBeNull();
      expect(info?.model.id).toBe('llama3.1:8b');
      expect(info?.license).toBe('MIT');
      expect(info?.architecture).toBe('llama');
    });
  });

  describe('getAvailableModels', () => {
    it('returns empty array (no registry API)', async () => {
      const manager = createOllamaManager();

      const models = await manager.getAvailableModels();

      expect(models).toEqual([]);
    });
  });

  describe('searchModels', () => {
    it('returns empty array (no registry API)', async () => {
      const manager = createOllamaManager();

      const models = await manager.searchModels('llama');

      expect(models).toEqual([]);
    });
  });
});

describe('createOllamaManager', () => {
  it('creates manager with default config', () => {
    const manager = createOllamaManager();
    expect(manager).toBeInstanceOf(OllamaModelManager);
    expect(manager.engineId).toBe('ollama');
  });

  it('creates manager with custom config', () => {
    const manager = createOllamaManager({ host: 'http://custom:8080' });
    expect(manager).toBeInstanceOf(OllamaModelManager);
  });
});
