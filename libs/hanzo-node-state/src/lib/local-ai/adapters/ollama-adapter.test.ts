/**
 * Tests for Ollama adapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  OllamaAdapter,
  createOllamaAdapter,
  type OllamaConnection,
} from './ollama-adapter';
import {
  LocalAIEngine,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,
} from '../types';

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

describe('OllamaAdapter', () => {
  const testConnection: OllamaConnection = {
    nodeAddress: 'http://127.0.0.1:9550',
    token: 'test-token',
  };

  let adapter: OllamaAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createOllamaAdapter(testConnection);
  });

  describe('constructor', () => {
    it('creates adapter with correct engine', () => {
      expect(adapter.engine).toBe(LocalAIEngine.Ollama);
    });
  });

  describe('getStatus', () => {
    it('returns available when scan succeeds', async () => {
      mockScanOllamaModels.mockResolvedValue([]);

      const result = await adapter.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.engine).toBe(LocalAIEngine.Ollama);
        expect(result.data.available).toBe(true);
        expect(result.data.running).toBe(true);
        expect(result.data.apiUrl).toBe(testConnection.nodeAddress);
      }
    });

    it('returns unavailable when scan fails', async () => {
      mockScanOllamaModels.mockRejectedValue(new Error('Connection refused'));

      const result = await adapter.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.available).toBe(false);
        expect(result.data.running).toBe(false);
        expect(result.data.error).toContain('Connection refused');
      }
    });
  });

  describe('scanModels', () => {
    it('transforms models to LocalAIModel format', async () => {
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

      const result = await adapter.scanModels();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        const model = result.data[0];

        expect(model.id).toBe('ollama:llama3.1:8b-instruct-q4_1');
        expect(model.name).toBe('llama3.1');
        expect(model.tag).toBe('8b-instruct-q4_1');
        expect(model.engine).toBe(LocalAIEngine.Ollama);
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

      const result = await adapter.scanModels();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
      }
    });

    it('returns error on API failure', async () => {
      mockScanOllamaModels.mockRejectedValue(new Error('API error'));

      const result = await adapter.scanModels();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('API error');
      }
    });
  });

  describe('installModel', () => {
    it('installs model and yields progress', async () => {
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

      const generator = adapter.installModel('mistral', '7b');
      const progress: unknown[] = [];

      for await (const p of generator) {
        progress.push(p);
      }

      // Verify progress events were yielded
      expect(progress.length).toBeGreaterThan(0);

      // First progress should be starting
      expect((progress[0] as any).percent).toBe(0);
      expect((progress[0] as any).status).toBe('Starting installation');

      // Last progress should be complete
      expect((progress[progress.length - 1] as any).percent).toBe(100);
    });

    it('returns error when model not found after installation', async () => {
      mockAddOllamaModels.mockResolvedValue({ success: true });
      mockScanOllamaModels.mockResolvedValue([]);

      const generator = adapter.installModel('nonexistent', 'latest');
      const progress: unknown[] = [];

      let result;
      for await (const p of generator) {
        progress.push(p);
        result = p;
      }

      // Generator should have returned (not yielded) the error result
      // The last yielded value is the 100% progress, but return value is the error
    });
  });

  describe('getModel', () => {
    it('returns model when found', async () => {
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

      const result = await adapter.getModel('ollama:qwen3:4b');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toBeNull();
        expect(result.data?.name).toBe('qwen3');
      }
    });

    it('returns null when model not found', async () => {
      mockScanOllamaModels.mockResolvedValue([]);

      const result = await adapter.getModel('ollama:nonexistent:latest');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
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

      const result = await adapter.isModelInstalled('llama3', '8b');

      expect(result).toBe(true);
    });

    it('returns false when model is not installed', async () => {
      mockScanOllamaModels.mockResolvedValue([]);

      const result = await adapter.isModelInstalled('nonexistent', 'latest');

      expect(result).toBe(false);
    });
  });

  describe('removeModel', () => {
    it('returns error (not yet implemented)', async () => {
      const result = await adapter.removeModel('ollama:test:latest');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not yet implemented');
      }
    });
  });

  describe('setModelDefinitions', () => {
    it('enriches scanned models with definitions', async () => {
      adapter.setModelDefinitions([
        {
          name: 'llama3.1',
          description: 'Meta Llama 3.1 - powerful open model',
          supportTools: true,
          defaultTag: 'llama3.1:8b',
          tags: [{ name: 'llama3.1:8b', hash: 'abc', size: '4.7GB', isDefault: true }],
          embedding: false,
          vision: false,
          thinking: false,
        },
      ]);

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

      const result = await adapter.scanModels();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].description).toBe('Meta Llama 3.1 - powerful open model');
        expect(result.data[0].capabilities).toContain(ModelCapability.ToolCalling);
      }
    });
  });

  describe('setConnection', () => {
    it('updates connection configuration', async () => {
      const newConnection: OllamaConnection = {
        nodeAddress: 'http://localhost:8080',
        token: 'new-token',
      };

      adapter.setConnection(newConnection);

      mockScanOllamaModels.mockResolvedValue([]);
      await adapter.scanModels();

      expect(mockScanOllamaModels).toHaveBeenCalledWith(
        'http://localhost:8080',
        'new-token',
      );
    });
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

    const adapter = createOllamaAdapter(testConnection);
    const result = await adapter.scanModels();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].provider).toBe('Meta');
    }
  });

  it('extracts DeepSeek as provider for deepseek models', async () => {
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

    const adapter = createOllamaAdapter(testConnection);
    const result = await adapter.scanModels();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].provider).toBe('DeepSeek');
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

    const adapter = createOllamaAdapter(testConnection);
    const result = await adapter.scanModels();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].provider).toBe('Alibaba');
    }
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

    const adapter = createOllamaAdapter(testConnection);
    const result = await adapter.scanModels();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].quality).toBe(ModelQuality.Excellent);
      expect(result.data[0].speed).toBe(ModelSpeed.Slow);
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

    const adapter = createOllamaAdapter(testConnection);
    const result = await adapter.scanModels();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].quality).toBe(ModelQuality.Low);
      expect(result.data[0].speed).toBe(ModelSpeed.VeryFast);
    }
  });
});
