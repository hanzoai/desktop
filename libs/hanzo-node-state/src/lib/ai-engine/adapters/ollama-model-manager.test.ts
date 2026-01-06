/**
 * Tests for Ollama Model Manager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  OllamaModelManager,
  createOllamaModelManager,
  type OllamaConnection,
} from './ollama-model-manager';
import { ModelCapability, ModelQuality, ModelSpeed, ModelStatus } from '../types';

// Mock the API
vi.mock('@hanzo_network/hanzo-message-ts/api/ollama', () => ({
  scanOllamaModels: vi.fn(),
  addOllamaModels: vi.fn(),
}));

import {
  scanOllamaModels,
  addOllamaModels,
} from '@hanzo_network/hanzo-message-ts/api/ollama';

const mockScanOllamaModels = scanOllamaModels as ReturnType<typeof vi.fn>;
const mockAddOllamaModels = addOllamaModels as ReturnType<typeof vi.fn>;

describe('OllamaModelManager', () => {
  const testConnection: OllamaConnection = {
    nodeAddress: 'http://127.0.0.1:9550',
    token: 'test-token',
  };

  let manager: OllamaModelManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createOllamaModelManager(testConnection);
  });

  describe('constructor', () => {
    it('creates manager with engine', () => {
      expect(manager.engine).toBeDefined();
      expect(manager.engine.id).toBe('ollama');
    });
  });

  describe('getInstalledModels', () => {
    it('transforms models to InstalledModel format', async () => {
      mockScanOllamaModels.mockResolvedValue([
        {
          model: 'llama3.1:8b-instruct-q4_1',
          name: 'llama3.1:8b-instruct-q4_1',
          size: 4700000000,
          digest: 'abc123',
          modified_at: '2024-01-01T00:00:00Z',
          port_used: '11434',
          details: {
            families: ['llama'],
            family: 'llama',
            format: 'gguf',
            parameter_size: '8B',
            parent_model: '',
            quantization_level: 'q4_1',
          },
        },
      ]);

      const result = await manager.getInstalledModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        const model = result.value[0];

        expect(model.id).toBe('llama3.1:8b-instruct-q4_1');
        expect(model.name).toBe('llama3.1');
        expect(model.tag).toBe('8b-instruct-q4_1');
        expect(model.status).toBe(ModelStatus.Installed);
        expect(model.sizeBytes).toBe(4700000000);
        expect(model.capabilities).toContain(ModelCapability.TextGeneration);
      }
    });

    it('deduplicates models by name', async () => {
      mockScanOllamaModels.mockResolvedValue([
        {
          model: 'qwen3:4b',
          name: 'qwen3:4b',
          size: 2500000000,
          digest: 'xyz789',
          modified_at: '2024-01-01T00:00:00Z',
          port_used: '11434',
          details: {
            families: ['qwen'],
            family: 'qwen',
            format: 'gguf',
            parameter_size: '4B',
            parent_model: '',
            quantization_level: 'q4_0',
          },
        },
        {
          model: 'qwen3:4b',
          name: 'qwen3:4b',
          size: 2500000000,
          digest: 'xyz789',
          modified_at: '2024-01-01T00:00:00Z',
          port_used: '11435',
          details: {
            families: ['qwen'],
            family: 'qwen',
            format: 'gguf',
            parameter_size: '4B',
            parent_model: '',
            quantization_level: 'q4_0',
          },
        },
      ]);

      const result = await manager.getInstalledModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });

    it('returns error on API failure', async () => {
      mockScanOllamaModels.mockRejectedValue(new Error('API error'));

      const result = await manager.getInstalledModels();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('API error');
      }
    });
  });

  describe('pullModel', () => {
    it('pulls model and yields progress', async () => {
      mockAddOllamaModels.mockResolvedValue({ success: true });
      mockScanOllamaModels.mockResolvedValue([
        {
          model: 'mistral:7b',
          name: 'mistral:7b',
          size: 4000000000,
          digest: 'def456',
          modified_at: '2024-01-01T00:00:00Z',
          port_used: '11434',
          details: {
            families: ['mistral'],
            family: 'mistral',
            format: 'gguf',
            parameter_size: '7B',
            parent_model: '',
            quantization_level: 'q4_0',
          },
        },
      ]);

      const generator = manager.pullModel('mistral:7b');
      const progress: unknown[] = [];

      for await (const p of generator) {
        progress.push(p);
      }

      expect(progress.length).toBeGreaterThan(0);
      expect((progress[0] as { percent: number }).percent).toBe(0);
      expect((progress[0] as { status: string }).status).toBe('Starting download');
      expect((progress[progress.length - 1] as { percent: number }).percent).toBe(100);
    });
  });

  describe('isModelInstalled', () => {
    it('returns true when model is installed', async () => {
      mockScanOllamaModels.mockResolvedValue([
        {
          model: 'llama3:8b',
          name: 'llama3:8b',
          size: 4500000000,
          digest: 'abc123',
          modified_at: '2024-01-01T00:00:00Z',
          port_used: '11434',
          details: {
            families: ['llama'],
            family: 'llama',
            format: 'gguf',
            parameter_size: '8B',
            parent_model: '',
            quantization_level: 'q4_0',
          },
        },
      ]);

      const result = await manager.isModelInstalled('llama3:8b');

      expect(result).toBe(true);
    });

    it('returns false when model is not installed', async () => {
      mockScanOllamaModels.mockResolvedValue([]);

      const result = await manager.isModelInstalled('nonexistent:latest');

      expect(result).toBe(false);
    });
  });

  describe('removeModel', () => {
    it('returns error (not yet implemented)', async () => {
      const result = await manager.removeModel('test:latest');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not yet implemented');
      }
    });
  });

  describe('getAvailableModels', () => {
    it('returns empty array (not yet implemented)', async () => {
      const result = await manager.getAvailableModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});

describe('quality and speed inference', () => {
  const testConnection: OllamaConnection = {
    nodeAddress: 'http://127.0.0.1:9550',
    token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('infers excellent quality for 70B+ models', async () => {
    mockScanOllamaModels.mockResolvedValue([
      {
        model: 'llama3:70b',
        name: 'llama3:70b',
        size: 40000000000,
        digest: 'abc123',
        modified_at: '2024-01-01T00:00:00Z',
        port_used: '11434',
        details: {
          families: ['llama'],
          family: 'llama',
          format: 'gguf',
          parameter_size: '70B',
          parent_model: '',
          quantization_level: 'q4_0',
        },
      },
    ]);

    const manager = createOllamaModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].quality).toBe(ModelQuality.Excellent);
      expect(result.value[0].speed).toBe(ModelSpeed.Slow);
    }
  });

  it('infers low quality and very fast speed for small models', async () => {
    mockScanOllamaModels.mockResolvedValue([
      {
        model: 'qwen3:0.6b',
        name: 'qwen3:0.6b',
        size: 400000000,
        digest: 'abc123',
        modified_at: '2024-01-01T00:00:00Z',
        port_used: '11434',
        details: {
          families: ['qwen'],
          family: 'qwen',
          format: 'gguf',
          parameter_size: '0.6B',
          parent_model: '',
          quantization_level: 'q4_0',
        },
      },
    ]);

    const manager = createOllamaModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].quality).toBe(ModelQuality.Low);
      expect(result.value[0].speed).toBe(ModelSpeed.VeryFast);
    }
  });
});

describe('provider extraction', () => {
  const testConnection: OllamaConnection = {
    nodeAddress: 'http://127.0.0.1:9550',
    token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts Meta as provider for llama models', async () => {
    mockScanOllamaModels.mockResolvedValue([
      {
        model: 'llama3.1:8b',
        name: 'llama3.1:8b',
        size: 4700000000,
        digest: 'abc123',
        modified_at: '2024-01-01T00:00:00Z',
        port_used: '11434',
        details: {
          families: ['llama'],
          family: 'llama',
          format: 'gguf',
          parameter_size: '8B',
          parent_model: '',
          quantization_level: 'q4_0',
        },
      },
    ]);

    const manager = createOllamaModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].provider).toBe('Llama');
    }
  });

  it('extracts Alibaba as provider for qwen models', async () => {
    mockScanOllamaModels.mockResolvedValue([
      {
        model: 'qwen3:4b',
        name: 'qwen3:4b',
        size: 2500000000,
        digest: 'xyz789',
        modified_at: '2024-01-01T00:00:00Z',
        port_used: '11434',
        details: {
          families: ['qwen'],
          family: 'qwen',
          format: 'gguf',
          parameter_size: '4B',
          parent_model: '',
          quantization_level: 'q4_0',
        },
      },
    ]);

    const manager = createOllamaModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].provider).toBe('Qwen');
    }
  });
});
