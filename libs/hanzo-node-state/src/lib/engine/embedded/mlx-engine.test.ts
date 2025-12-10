/**
 * MLXEngine unit tests.
 *
 * Tests the MLX embedded engine interface with mocked Tauri functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MLXEngineImpl, createMLXEngine } from './mlx-engine';
import type { MLXEngineConfig } from './mlx-engine';
import type { MLXLoadedModelInfo } from './types';
import { MLXTauriCommands } from './types';

// Mock Tauri functions
const mockInvoke = vi.fn();
const mockListen = vi.fn();

function createMockConfig(): MLXEngineConfig {
  return {
    invoke: mockInvoke,
    listen: mockListen,
  };
}

describe('MLXEngineImpl', () => {
  let engine: MLXEngineImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new MLXEngineImpl(createMockConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates an engine with correct identity', () => {
      expect(engine.id).toBe('mlx-engine');
      expect(engine.name).toBe('MLX Engine');
      expect(engine.baseUrl).toBe('tauri://mlx-engine');
      expect(engine.apiKey).toBeUndefined();
    });
  });

  describe('isAppleSilicon', () => {
    it('returns true on Apple Silicon', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await engine.isAppleSilicon();

      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.isAppleSilicon);
    });

    it('returns false on non-Apple Silicon', async () => {
      mockInvoke.mockResolvedValueOnce(false);

      const result = await engine.isAppleSilicon();

      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Not supported'));

      const result = await engine.isAppleSilicon();

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns available status when engine is ready on Apple Silicon', async () => {
      // isAppleSilicon check
      mockInvoke.mockResolvedValueOnce(true);
      // getStatus
      mockInvoke.mockResolvedValueOnce({
        available: true,
        ready: true,
        version: '0.1.0',
        modelLoaded: true,
      });

      const status = await engine.getStatus();

      expect(status.available).toBe(true);
      expect(status.ready).toBe(true);
      expect(status.version).toBe('0.1.0');
    });

    it('returns not ready when no model loaded', async () => {
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce({
        available: true,
        ready: true,
        version: '0.1.0',
        modelLoaded: false,
      });

      const status = await engine.getStatus();

      expect(status.ready).toBe(false);
    });

    it('returns unavailable on non-Apple Silicon', async () => {
      mockInvoke.mockResolvedValueOnce(false); // isAppleSilicon

      const status = await engine.getStatus();

      expect(status.available).toBe(false);
      expect(status.ready).toBe(false);
      expect(status.error).toBe('MLX requires Apple Silicon (M1/M2/M3/M4)');
    });

    it('returns error status on failure', async () => {
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockRejectedValueOnce(new Error('Engine not available'));

      const status = await engine.getStatus();

      expect(status.available).toBe(false);
      expect(status.ready).toBe(false);
      expect(status.error).toBe('Engine not available');
    });
  });

  describe('loadModel', () => {
    const mockModelInfo: MLXLoadedModelInfo = {
      modelId: 'mlx-community/Qwen3-8B-4bit',
      path: '/Users/test/.cache/huggingface/hub/mlx-community/Qwen3-8B-4bit',
      name: 'Qwen3-8B-4bit',
      sizeBytes: 4_500_000_000,
      maxSequenceLength: 32768,
      quantization: '4bit',
      architecture: 'qwen3',
      parameters: '8B',
      usesGQA: true,
    };

    it('loads a model successfully on Apple Silicon', async () => {
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce(mockModelInfo); // loadModel

      const result = await engine.loadModel('mlx-community/Qwen3-8B-4bit');

      expect(result.ok).toBe(true);
      expect(engine.isModelLoaded()).toBe(true);
      expect(engine.getLoadedModel()).toEqual(mockModelInfo);
      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.loadModel, {
        modelIdOrPath: 'mlx-community/Qwen3-8B-4bit',
        maxSequenceLength: undefined,
        memoryLimit: undefined,
        quantize4bit: undefined,
        prefillChunkSize: 512,
        speculativeDecoding: false,
      });
    });

    it('loads a model with custom options', async () => {
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce(mockModelInfo);

      await engine.loadModel('mlx-community/Qwen3-8B-4bit', {
        maxSequenceLength: 8192,
        memoryLimit: 8_000_000_000,
        quantize4bit: true,
        prefillChunkSize: 256,
        speculativeDecoding: true,
      });

      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.loadModel, {
        modelIdOrPath: 'mlx-community/Qwen3-8B-4bit',
        maxSequenceLength: 8192,
        memoryLimit: 8_000_000_000,
        quantize4bit: true,
        prefillChunkSize: 256,
        speculativeDecoding: true,
      });
    });

    it('returns error on non-Apple Silicon', async () => {
      mockInvoke.mockResolvedValueOnce(false); // isAppleSilicon

      const result = await engine.loadModel('mlx-community/Qwen3-8B-4bit');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('MLX requires Apple Silicon (M1/M2/M3/M4)');
      }
      expect(engine.isModelLoaded()).toBe(false);
    });

    it('returns error on load failure', async () => {
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockRejectedValueOnce(new Error('Model not found'));

      const result = await engine.loadModel('mlx-community/nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Model not found');
      }
      expect(engine.isModelLoaded()).toBe(false);
    });
  });

  describe('unloadModel', () => {
    it('unloads the current model', async () => {
      // First load a model
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce({
        modelId: 'mlx-community/Qwen3-8B-4bit',
        path: '/path/to/model',
        name: 'Qwen3-8B-4bit',
        sizeBytes: 4_500_000_000,
        maxSequenceLength: 32768,
        quantization: '4bit',
        architecture: 'qwen3',
      });
      await engine.loadModel('mlx-community/Qwen3-8B-4bit');
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
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce({
        modelId: 'mlx-community/Qwen3-8B-4bit',
        path: '/path/to/model',
        name: 'Qwen3-8B-4bit',
        sizeBytes: 4_500_000_000,
        maxSequenceLength: 32768,
        quantization: '4bit',
        architecture: 'qwen3',
      });
      await engine.loadModel('mlx-community/Qwen3-8B-4bit');

      const models = await engine.listModels();

      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('mlx-community/Qwen3-8B-4bit');
      expect(models[0].name).toBe('Qwen3-8B-4bit');
      expect(models[0].ownedBy).toBe('mlx-community');
    });
  });

  describe('complete', () => {
    it('throws when no model loaded', async () => {
      await expect(engine.complete('Hello')).rejects.toThrow('No model loaded');
    });

    it('completes text when model is loaded', async () => {
      // Load model first
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce({
        modelId: 'mlx-community/Qwen3-8B-4bit',
        path: '/path/to/model',
        name: 'Qwen3-8B-4bit',
        sizeBytes: 4_500_000_000,
        maxSequenceLength: 32768,
        quantization: '4bit',
        architecture: 'qwen3',
      });
      await engine.loadModel('mlx-community/Qwen3-8B-4bit');

      // Complete
      mockInvoke.mockResolvedValueOnce('World!');
      const result = await engine.complete('Hello');

      expect(result).toBe('World!');
      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.complete, {
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
      mockInvoke.mockResolvedValueOnce(true); // isAppleSilicon
      mockInvoke.mockResolvedValueOnce({
        modelId: 'mlx-community/Qwen3-8B-4bit',
        path: '/path/to/model',
        name: 'Qwen3-8B-4bit',
        sizeBytes: 4_500_000_000,
        maxSequenceLength: 32768,
        quantization: '4bit',
        architecture: 'qwen3',
      });
      await engine.loadModel('mlx-community/Qwen3-8B-4bit');

      // Embed
      const mockEmbeddings = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      mockInvoke.mockResolvedValueOnce(mockEmbeddings);
      const result = await engine.embed(['Hello', 'World']);

      expect(result).toEqual(mockEmbeddings);
      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.embed, {
        input: ['Hello', 'World'],
      });
    });
  });

  describe('getMemoryUsage', () => {
    it('returns MLX memory information', async () => {
      const mockMemory = {
        activeBytes: 4_000_000_000,
        peakBytes: 5_000_000_000,
        cacheBytes: 500_000_000,
        totalUnifiedMemoryBytes: 32_000_000_000,
      };
      mockInvoke.mockResolvedValueOnce(mockMemory);

      const result = await engine.getMemoryUsage();

      expect(result).toEqual(mockMemory);
      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.getMemoryUsage);
    });
  });

  describe('getAppleSiliconInfo', () => {
    it('returns Apple Silicon chip information', async () => {
      const mockChipInfo = {
        chipName: 'Apple M2 Pro',
        gpuCores: 19,
        neuralEngineCores: 16,
        unifiedMemoryBytes: 32_000_000_000,
        memoryBandwidthGBs: 200,
      };
      mockInvoke.mockResolvedValueOnce(mockChipInfo);

      const result = await engine.getAppleSiliconInfo();

      expect(result).toEqual(mockChipInfo);
      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.getAppleSiliconInfo);
    });

    it('returns null when not on Apple Silicon', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await engine.getAppleSiliconInfo();

      expect(result).toBeNull();
    });
  });

  describe('cancelGeneration', () => {
    it('calls cancel command', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await engine.cancelGeneration();

      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.cancel);
    });
  });

  describe('clearCache', () => {
    it('calls clearCache command', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await engine.clearCache();

      expect(mockInvoke).toHaveBeenCalledWith(MLXTauriCommands.clearCache);
    });
  });
});

describe('createMLXEngine', () => {
  it('creates an MLXEngineImpl instance', () => {
    const engine = createMLXEngine(createMockConfig());

    expect(engine).toBeInstanceOf(MLXEngineImpl);
    expect(engine.id).toBe('mlx-engine');
  });
});
