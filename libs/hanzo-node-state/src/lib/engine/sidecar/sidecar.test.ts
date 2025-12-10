/**
 * Sidecar Engine tests.
 *
 * Tests the sidecar engine interfaces and implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOllama,
  createHanzoNode,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,
  type SidecarEngine,
  type ModelManager,
  type InstalledModel,
} from './index';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OllamaSidecar', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('createOllama', () => {
    it('creates with default config', () => {
      const sidecar = createOllama();

      expect(sidecar.id).toBe('ollama');
      expect(sidecar.name).toBe('Ollama');
      expect(sidecar.baseUrl).toBe('http://127.0.0.1:11434/v1');
    });

    it('allows custom base URL', () => {
      const sidecar = createOllama({
        baseUrl: 'http://192.168.1.100:11434',
      });

      expect(sidecar.baseUrl).toBe('http://192.168.1.100:11434/v1');
    });
  });

  describe('SidecarEngine interface', () => {
    it('has lifecycle methods', () => {
      const sidecar: SidecarEngine = createOllama();

      expect(typeof sidecar.start).toBe('function');
      expect(typeof sidecar.stop).toBe('function');
      expect(typeof sidecar.restart).toBe('function');
      expect(typeof sidecar.isRunning).toBe('function');
      expect(typeof sidecar.getHealth).toBe('function');
    });
  });

  describe('ModelManager interface', () => {
    it('has model management methods', () => {
      const sidecar: ModelManager = createOllama();

      expect(typeof sidecar.pullModel).toBe('function');
      expect(typeof sidecar.removeModel).toBe('function');
      expect(typeof sidecar.getInstalledModels).toBe('function');
      expect(typeof sidecar.isModelInstalled).toBe('function');
    });
  });

  describe('isRunning', () => {
    it('returns true when Ollama is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '0.5.0' }),
      });

      const sidecar = createOllama();
      const running = await sidecar.isRunning();

      expect(running).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:11434/api/version');
    });

    it('returns false when Ollama is not available', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const sidecar = createOllama();
      const running = await sidecar.isRunning();

      expect(running).toBe(false);
    });
  });

  describe('getHealth', () => {
    it('returns health status when running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '0.5.0' }),
      });

      const sidecar = createOllama();
      const health = await sidecar.getHealth();

      expect(health.running).toBe(true);
      expect(health.version).toBe('0.5.0');
    });

    it('returns error status when not running', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const sidecar = createOllama();
      const health = await sidecar.getHealth();

      expect(health.running).toBe(false);
      expect(health.error).toBe('ECONNREFUSED');
    });
  });

  describe('getInstalledModels', () => {
    it('returns installed models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              {
                model: 'llama3.2:3b',
                size: 2000000000,
                digest: 'abc123',
                modified_at: '2024-01-01T00:00:00Z',
                details: {
                  family: 'llama',
                  parameter_size: '3B',
                  quantization_level: 'Q4_K_M',
                },
              },
            ],
          }),
      });

      const sidecar = createOllama();
      const result = await sidecar.getInstalledModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('llama3.2:3b');
        expect(result.value[0].name).toBe('llama3.2');
        expect(result.value[0].tag).toBe('3b');
        expect(result.value[0].capabilities).toContain(ModelCapability.TextGeneration);
      }
    });

    it('returns error on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const sidecar = createOllama();
      const result = await sidecar.getInstalledModels();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Network error');
      }
    });
  });
});

describe('HanzoNodeSidecar', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('createHanzoNode', () => {
    it('creates with required config', () => {
      const sidecar = createHanzoNode({
        nodeAddress: 'http://127.0.0.1:9550',
        token: 'test-token',
      });

      expect(sidecar.id).toBe('hanzo-node');
      expect(sidecar.name).toBe('Hanzo Node');
      expect(sidecar.apiKey).toBe('test-token');
    });
  });

  describe('isRunning', () => {
    it('returns true when node is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const sidecar = createHanzoNode({
        nodeAddress: 'http://127.0.0.1:9550',
        token: 'test-token',
      });
      const running = await sidecar.isRunning();

      expect(running).toBe(true);
    });
  });
});

describe('Model types', () => {
  it('ModelCapability has correct values', () => {
    expect(ModelCapability.TextGeneration).toBe('text-generation');
    expect(ModelCapability.Vision).toBe('vision');
    expect(ModelCapability.Thinking).toBe('thinking');
    expect(ModelCapability.ToolCalling).toBe('tool-calling');
    expect(ModelCapability.Embedding).toBe('embedding');
    expect(ModelCapability.Code).toBe('code');
  });

  it('ModelQuality has correct values', () => {
    expect(ModelQuality.Low).toBe('low');
    expect(ModelQuality.Medium).toBe('medium');
    expect(ModelQuality.Good).toBe('good');
    expect(ModelQuality.Excellent).toBe('excellent');
  });

  it('ModelSpeed has correct values', () => {
    expect(ModelSpeed.Slow).toBe('slow');
    expect(ModelSpeed.Average).toBe('average');
    expect(ModelSpeed.Fast).toBe('fast');
    expect(ModelSpeed.VeryFast).toBe('very-fast');
  });

  it('ModelStatus has correct values', () => {
    expect(ModelStatus.Available).toBe('available');
    expect(ModelStatus.Installing).toBe('installing');
    expect(ModelStatus.Installed).toBe('installed');
    expect(ModelStatus.Running).toBe('running');
    expect(ModelStatus.Failed).toBe('failed');
  });
});

describe('InstalledModel type', () => {
  it('has required properties', () => {
    const model: InstalledModel = {
      id: 'llama3.2:3b',
      name: 'llama3.2',
      tag: '3b',
      sizeBytes: 2000000000,
      contextLength: 128000,
      capabilities: [ModelCapability.TextGeneration],
      quality: ModelQuality.Medium,
      speed: ModelSpeed.Fast,
      status: ModelStatus.Installed,
    };

    expect(model.id).toBe('llama3.2:3b');
    expect(model.capabilities).toContain(ModelCapability.TextGeneration);
  });
});
