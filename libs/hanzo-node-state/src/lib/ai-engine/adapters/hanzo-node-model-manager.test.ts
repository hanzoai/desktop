/**
 * Tests for Hanzo Node Model Manager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  HanzoNodeModelManager,
  createHanzoNodeModelManager,
  HANZO_NODE_BENEFITS,
  HANZO_NODE_ENGINE_INFO,
  type HanzoNodeConnection,
} from './hanzo-node-model-manager';
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

// Shared test config
const testConnection: HanzoNodeConnection = {
  nodeAddress: 'http://127.0.0.1:9550',
  token: 'test-token',
};

describe('HanzoNodeModelManager', () => {
  let manager: HanzoNodeModelManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createHanzoNodeModelManager(testConnection);
  });

  describe('constructor', () => {
    it('creates manager with Hanzo Node engine', () => {
      expect(manager.engine).toBeDefined();
      expect(manager.engine.id).toBe('hanzo-node');
      expect(manager.engine.name).toBe('Hanzo Node');
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
        expect(model.tag).toBe('8b-instruct-q4_1');
        expect(model.status).toBe(ModelStatus.Installed);
        expect(model.sizeBytes).toBe(4700000000);
        expect(model.parameters).toBe('8B');
        expect(model.quantization).toBe('q4_1');
        expect(model.capabilities).toContain(ModelCapability.TextGeneration);
        expect(model.capabilities).toContain(ModelCapability.ToolCalling);
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
        expect(result.error).toContain('Failed to scan models');
      }
    });

    it('includes mining metadata', async () => {
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

      const result = await manager.getInstalledModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const metadata = result.value[0].metadata as Record<string, unknown>;
        expect(metadata.miningEnabled).toBe(true);
        expect(metadata.verifiedInference).toBe(true);
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
      expect((progress[0] as { status: string }).status).toBe('Starting installation');
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
    it('returns error (not yet supported)', async () => {
      const result = await manager.removeModel('test:latest');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not yet supported');
      }
    });
  });
});

describe('HANZO_NODE_BENEFITS', () => {
  it('has mining benefit', () => {
    expect(HANZO_NODE_BENEFITS.mining).toBeDefined();
    expect(HANZO_NODE_BENEFITS.mining.title).toBe('Earn AI Coin');
  });

  it('has verification benefit', () => {
    expect(HANZO_NODE_BENEFITS.verification).toBeDefined();
    expect(HANZO_NODE_BENEFITS.verification.title).toBe('Blockchain Verified');
  });

  it('has ecosystem benefit', () => {
    expect(HANZO_NODE_BENEFITS.ecosystem).toBeDefined();
    expect(HANZO_NODE_BENEFITS.ecosystem.title).toBe('Hanzo Ecosystem');
  });
});

describe('HANZO_NODE_ENGINE_INFO', () => {
  it('is marked as recommended', () => {
    expect(HANZO_NODE_ENGINE_INFO.isRecommended).toBe(true);
  });

  it('is marked as default', () => {
    expect(HANZO_NODE_ENGINE_INFO.isDefault).toBe(true);
  });

  it('has correct id', () => {
    expect(HANZO_NODE_ENGINE_INFO.id).toBe('hanzo-node');
  });

  it('includes benefits', () => {
    expect(HANZO_NODE_ENGINE_INFO.benefits.length).toBeGreaterThan(0);
  });
});

describe('inferCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('infers vision capability for vision models', async () => {
    mockScanOllamaModels.mockResolvedValue([
      {
        model: 'llava:7b',
        name: 'llava:7b',
        size: 4500000000,
        digest: 'abc123',
        modified_at: '2024-01-01T00:00:00Z',
        port_used: '11434',
        details: {
          families: ['clip', 'llama'],
          family: 'llama',
          format: 'gguf',
          parameter_size: '7B',
          parent_model: '',
          quantization_level: 'q4_0',
        },
      },
    ]);

    const manager = createHanzoNodeModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].capabilities).toContain(ModelCapability.Vision);
    }
  });

  it('infers thinking capability for reasoning models', async () => {
    mockScanOllamaModels.mockResolvedValue([
      {
        model: 'deepseek-r1:70b',
        name: 'deepseek-r1:70b',
        size: 40000000000,
        digest: 'abc123',
        modified_at: '2024-01-01T00:00:00Z',
        port_used: '11434',
        details: {
          families: ['deepseek'],
          family: 'deepseek',
          format: 'gguf',
          parameter_size: '70B',
          parent_model: '',
          quantization_level: 'q4_0',
        },
      },
    ]);

    const manager = createHanzoNodeModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].capabilities).toContain(ModelCapability.Thinking);
    }
  });
});

describe('quality and speed inference', () => {
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

    const manager = createHanzoNodeModelManager(testConnection);
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

    const manager = createHanzoNodeModelManager(testConnection);
    const result = await manager.getInstalledModels();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].quality).toBe(ModelQuality.Low);
      expect(result.value[0].speed).toBe(ModelSpeed.VeryFast);
    }
  });
});
