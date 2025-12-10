/**
 * HanzoEngine unit tests.
 *
 * Tests the embedded engine interface with mocked Tauri functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HanzoEngine, createHanzoEngine } from './hanzo-engine';
import type { HanzoEngineConfig } from './hanzo-engine';
import type { LoadedModelInfo } from './types';
import { TauriCommands } from './types';

// Mock Tauri functions
const mockInvoke = vi.fn();
const mockListen = vi.fn();

function createMockConfig(): HanzoEngineConfig {
  return {
    invoke: mockInvoke,
    listen: mockListen,
  };
}

describe('HanzoEngine', () => {
  let engine: HanzoEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new HanzoEngine(createMockConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates an engine with correct identity', () => {
      expect(engine.id).toBe('hanzo-engine');
      expect(engine.name).toBe('Hanzo Engine');
      expect(engine.baseUrl).toBe('tauri://hanzo-engine');
      expect(engine.apiKey).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('returns available status when engine is ready', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        ready: true,
        version: '0.6.0',
        modelLoaded: true,
      });

      const status = await engine.getStatus();

      expect(status.available).toBe(true);
      expect(status.ready).toBe(true);
      expect(status.version).toBe('0.6.0');
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.getStatus);
    });

    it('returns not ready when no model loaded', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        ready: true,
        version: '0.6.0',
        modelLoaded: false,
      });

      const status = await engine.getStatus();

      expect(status.ready).toBe(false);
    });

    it('returns error status on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Engine not available'));

      const status = await engine.getStatus();

      expect(status.available).toBe(false);
      expect(status.ready).toBe(false);
      expect(status.error).toBe('Engine not available');
    });
  });

  describe('loadModel', () => {
    const mockModelInfo: LoadedModelInfo = {
      path: '/path/to/model.gguf',
      name: 'model',
      sizeBytes: 4_000_000_000,
      contextLength: 8192,
      quantization: 'Q4_K_M',
      architecture: 'llama',
      parameters: '8B',
      gpuLayers: 32,
    };

    it('loads a model successfully', async () => {
      mockInvoke.mockResolvedValueOnce(mockModelInfo);

      const result = await engine.loadModel('/path/to/model.gguf');

      expect(result.ok).toBe(true);
      expect(engine.isModelLoaded()).toBe(true);
      expect(engine.getLoadedModel()).toEqual(mockModelInfo);
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.loadModel, {
        path: '/path/to/model.gguf',
        contextLength: undefined,
        gpuLayers: undefined,
        threads: undefined,
        flashAttention: undefined,
        kvCache: true,
        prefixCacheN: 16,
      });
    });

    it('loads a model with custom options', async () => {
      mockInvoke.mockResolvedValueOnce(mockModelInfo);

      await engine.loadModel('/path/to/model.gguf', {
        contextLength: 4096,
        gpuLayers: -1,
        threads: 8,
        flashAttention: true,
        kvCache: false,
        prefixCacheN: 32,
      });

      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.loadModel, {
        path: '/path/to/model.gguf',
        contextLength: 4096,
        gpuLayers: -1,
        threads: 8,
        flashAttention: true,
        kvCache: false,
        prefixCacheN: 32,
      });
    });

    it('returns error on load failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Invalid GGUF file'));

      const result = await engine.loadModel('/path/to/invalid.gguf');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Invalid GGUF file');
      }
      expect(engine.isModelLoaded()).toBe(false);
    });
  });

  describe('unloadModel', () => {
    it('unloads the current model', async () => {
      // First load a model
      mockInvoke.mockResolvedValueOnce({
        path: '/path/to/model.gguf',
        name: 'model',
        sizeBytes: 4_000_000_000,
        contextLength: 8192,
        quantization: 'Q4_K_M',
        architecture: 'llama',
        gpuLayers: 32,
      });
      await engine.loadModel('/path/to/model.gguf');
      expect(engine.isModelLoaded()).toBe(true);

      // Then unload
      mockInvoke.mockResolvedValueOnce(undefined);
      const result = await engine.unloadModel();

      expect(result.ok).toBe(true);
      expect(engine.isModelLoaded()).toBe(false);
      expect(engine.getLoadedModel()).toBeNull();
    });
  });

  describe('listModels', () => {
    it('returns empty list when no model loaded', async () => {
      const models = await engine.listModels();

      expect(models).toHaveLength(0);
    });

    it('returns loaded model when present', async () => {
      mockInvoke.mockResolvedValueOnce({
        path: '/path/to/model.gguf',
        name: 'test-model',
        sizeBytes: 4_000_000_000,
        contextLength: 8192,
        quantization: 'Q4_K_M',
        architecture: 'llama',
        gpuLayers: 32,
      });
      await engine.loadModel('/path/to/model.gguf');

      const models = await engine.listModels();

      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('/path/to/model.gguf');
      expect(models[0].name).toBe('test-model');
    });
  });

  describe('complete', () => {
    it('throws when no model loaded', async () => {
      await expect(engine.complete('Hello')).rejects.toThrow('No model loaded');
    });

    it('completes text when model is loaded', async () => {
      // Load model first
      mockInvoke.mockResolvedValueOnce({
        path: '/path/to/model.gguf',
        name: 'model',
        sizeBytes: 4_000_000_000,
        contextLength: 8192,
        quantization: 'Q4_K_M',
        architecture: 'llama',
        gpuLayers: 32,
      });
      await engine.loadModel('/path/to/model.gguf');

      // Complete
      mockInvoke.mockResolvedValueOnce('World!');
      const result = await engine.complete('Hello');

      expect(result).toBe('World!');
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.complete, {
        prompt: 'Hello',
        model: undefined,
        temperature: undefined,
        maxTokens: undefined,
        stop: undefined,
      });
    });
  });

  describe('embed', () => {
    it('throws when no model loaded', async () => {
      await expect(engine.embed('Hello')).rejects.toThrow('No model loaded');
    });

    it('generates embeddings when model is loaded', async () => {
      // Load model first
      mockInvoke.mockResolvedValueOnce({
        path: '/path/to/model.gguf',
        name: 'model',
        sizeBytes: 4_000_000_000,
        contextLength: 8192,
        quantization: 'Q4_K_M',
        architecture: 'llama',
        gpuLayers: 32,
      });
      await engine.loadModel('/path/to/model.gguf');

      // Embed
      const mockEmbeddings = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      mockInvoke.mockResolvedValueOnce(mockEmbeddings);
      const result = await engine.embed(['Hello', 'World']);

      expect(result).toEqual(mockEmbeddings);
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.embed, {
        input: ['Hello', 'World'],
      });
    });
  });

  describe('getMemoryUsage', () => {
    it('returns memory information', async () => {
      const mockMemory = {
        ramBytes: 8_000_000_000,
        vramBytes: 4_000_000_000,
        totalRamBytes: 32_000_000_000,
        totalVramBytes: 16_000_000_000,
      };
      mockInvoke.mockResolvedValueOnce(mockMemory);

      const result = await engine.getMemoryUsage();

      expect(result).toEqual(mockMemory);
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.getMemoryUsage);
    });
  });

  describe('getGpuInfo', () => {
    it('returns GPU information', async () => {
      const mockGpu = {
        backend: 'metal' as const,
        name: 'Apple M2 Pro',
        vramBytes: 16_000_000_000,
        availableVramBytes: 12_000_000_000,
      };
      mockInvoke.mockResolvedValueOnce(mockGpu);

      const result = await engine.getGpuInfo();

      expect(result).toEqual(mockGpu);
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.getGpuInfo);
    });

    it('returns null when no GPU available', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await engine.getGpuInfo();

      expect(result).toBeNull();
    });
  });

  describe('cancelGeneration', () => {
    it('calls cancel command', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await engine.cancelGeneration();

      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.cancel);
    });
  });
});

describe('createHanzoEngine', () => {
  it('creates a HanzoEngine instance', () => {
    const engine = createHanzoEngine(createMockConfig());

    expect(engine).toBeInstanceOf(HanzoEngine);
    expect(engine.id).toBe('hanzo-engine');
  });
});
