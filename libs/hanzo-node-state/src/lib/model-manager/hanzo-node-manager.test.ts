/**
 * Tests for HanzoNodeModelManager.
 *
 * Mocks the Hanzo Node API imports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScanOllamaModelsResponse } from '@hanzo_network/hanzo-message-ts/api/ollama';

// Mock the API module
vi.mock('@hanzo_network/hanzo-message-ts/api/ollama', () => ({
  scanOllamaModels: vi.fn(),
  addOllamaModels: vi.fn(),
}));

import { scanOllamaModels, addOllamaModels } from '@hanzo_network/hanzo-message-ts/api/ollama';
import {
  HanzoNodeModelManager,
  createHanzoNodeManager,
  HANZO_NODE_MANAGER_CAPABILITIES,
} from './hanzo-node-manager';

const mockScan = vi.mocked(scanOllamaModels);
const mockAdd = vi.mocked(addOllamaModels);

const TEST_CONFIG = {
  nodeAddress: 'http://127.0.0.1:9550',
  token: 'test-token',
};

describe('HanzoNodeModelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('sets engineId to hanzo-node', () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      expect(manager.engineId).toBe('hanzo-node');
    });
  });

  describe('capabilities', () => {
    it('has correct capabilities', () => {
      expect(HANZO_NODE_MANAGER_CAPABILITIES).toEqual({
        canSearch: true,
        hasProgress: false,
        canCancel: false,
        canResume: false,
        hasMining: true,
      });
    });
  });

  describe('getInstalledModels', () => {
    it('returns empty array when no models', async () => {
      mockScan.mockResolvedValue([]);
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const models = await manager.getInstalledModels();

      expect(models).toEqual([]);
      expect(mockScan).toHaveBeenCalledWith(TEST_CONFIG.nodeAddress, TEST_CONFIG.token);
    });

    it('transforms model list response with mining metadata', async () => {
      mockScan.mockResolvedValue([
        {
          model: 'llama3.1:8b',
          size: 4700000000,
          modified_at: '2024-01-15T10:30:00Z',
          digest: 'abc123',
          details: {
            family: 'llama',
            parameter_size: '8B',
            quantization_level: 'Q4_0',
          },
        },
      ] as ScanOllamaModelsResponse);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      const models = await manager.getInstalledModels();

      expect(models).toHaveLength(1);
      expect(models[0]).toMatchObject({
        id: 'llama3.1:8b',
        name: 'llama3.1',
        tag: '8b',
        sizeBytes: 4700000000,
        digest: 'abc123',
      });

      // Verify Hanzo-specific metadata
      expect(models[0].metadata).toMatchObject({
        miningEnabled: true,
        verifiedInference: true,
      });
    });

    it('deduplicates models by name', async () => {
      mockScan.mockResolvedValue([
        { model: 'llama3.1:8b', size: 1000, modified_at: '2024-01-15', digest: 'a' },
        { model: 'llama3.1:8b', size: 1000, modified_at: '2024-01-15', digest: 'a' },
        { model: 'qwen3:4b', size: 2000, modified_at: '2024-01-15', digest: 'b' },
      ] as ScanOllamaModelsResponse);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      const models = await manager.getInstalledModels();

      expect(models).toHaveLength(2);
    });
  });

  describe('getAvailableModels', () => {
    it('returns featured Hanzo models', async () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const models = await manager.getAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.source === 'hanzo')).toBe(true);
      expect(models.every((m) => m.miningRewards?.eligible)).toBe(true);
    });
  });

  describe('searchModels', () => {
    it('filters by name', async () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const models = await manager.searchModels('llama');

      expect(models.every((m) =>
        m.name.toLowerCase().includes('llama') ||
        m.description.toLowerCase().includes('llama')
      )).toBe(true);
    });

    it('filters by provider', async () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const models = await manager.searchModels('', { provider: 'Meta' });

      expect(models.every((m) => m.provider === 'Meta')).toBe(true);
    });

    it('applies limit', async () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const models = await manager.searchModels('', { limit: 2 });

      expect(models.length).toBeLessThanOrEqual(2);
    });
  });

  describe('pullModel', () => {
    it('yields progress and completes', async () => {
      mockAdd.mockResolvedValue(undefined);
      mockScan.mockResolvedValue([
        { model: 'llama3.1:8b', size: 4700000000, modified_at: '2024-01-15', digest: 'abc' },
      ] as ScanOllamaModelsResponse);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const progress: unknown[] = [];
      for await (const p of manager.pullModel('llama3.1:8b')) {
        progress.push(p);
      }

      expect(progress.length).toBeGreaterThanOrEqual(3);
      const lastProgress = progress[progress.length - 1] as { status: string };
      expect(lastProgress.status).toBe('complete');
      expect(mockAdd).toHaveBeenCalledWith(
        TEST_CONFIG.nodeAddress,
        TEST_CONFIG.token,
        { models: ['llama3.1:8b'] },
      );
    });

    it('yields error on installation failure', async () => {
      mockAdd.mockRejectedValue(new Error('Network error'));

      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const progress: unknown[] = [];
      for await (const p of manager.pullModel('llama3.1:8b')) {
        progress.push(p);
      }

      const lastProgress = progress[progress.length - 1] as { status: string; error: string };
      expect(lastProgress.status).toBe('error');
      expect(lastProgress.error).toContain('Network error');
    });

    it('yields error when model not found after install', async () => {
      mockAdd.mockResolvedValue(undefined);
      mockScan.mockResolvedValue([]); // Empty - model not found

      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const progress: unknown[] = [];
      for await (const p of manager.pullModel('llama3.1:8b')) {
        progress.push(p);
      }

      const lastProgress = progress[progress.length - 1] as { status: string; error: string };
      expect(lastProgress.status).toBe('error');
      expect(lastProgress.error).toContain('not found after installation');
    });
  });

  describe('removeModel', () => {
    it('throws not supported error', async () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      await expect(manager.removeModel('llama3.1:8b')).rejects.toThrow(
        'Model removal not yet supported',
      );
    });
  });

  describe('isModelInstalled', () => {
    it('returns true when model exists', async () => {
      mockScan.mockResolvedValue([
        { model: 'llama3.1:8b', size: 1000, modified_at: '2024-01-15', digest: 'abc' },
      ] as ScanOllamaModelsResponse);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      const installed = await manager.isModelInstalled('llama3.1:8b');

      expect(installed).toBe(true);
    });

    it('returns false when model not found', async () => {
      mockScan.mockResolvedValue([]);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      const installed = await manager.isModelInstalled('nonexistent:latest');

      expect(installed).toBe(false);
    });
  });

  describe('getModelInfo', () => {
    it('returns null for non-installed model', async () => {
      mockScan.mockResolvedValue([]);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      const info = await manager.getModelInfo('nonexistent:latest');

      expect(info).toBeNull();
    });

    it('returns model info with architecture details', async () => {
      mockScan.mockResolvedValue([
        {
          model: 'llama3.1:8b',
          size: 4700000000,
          modified_at: '2024-01-15',
          digest: 'abc123',
          details: {
            family: 'llama',
            families: ['llama'],
            parameter_size: '8B',
            quantization_level: 'Q4_0',
          },
        },
      ] as ScanOllamaModelsResponse);

      const manager = new HanzoNodeModelManager(TEST_CONFIG);
      const info = await manager.getModelInfo('llama3.1:8b');

      expect(info).not.toBeNull();
      expect(info?.model.id).toBe('llama3.1:8b');
      expect(info?.architecture).toBe('llama');
      expect(info?.parameters).toBe('8B');
      expect(info?.quantization).toBe('Q4_0');
    });
  });

  describe('getMiningInfo', () => {
    it('returns mining info for featured models', () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const info = manager.getMiningInfo('llama3.1:8b-instruct-q4_1');

      expect(info.eligible).toBe(true);
      expect(info.rewardRate).toBeDefined();
    });

    it('returns default mining info for unknown models', () => {
      const manager = new HanzoNodeModelManager(TEST_CONFIG);

      const info = manager.getMiningInfo('unknown-model:latest');

      expect(info.eligible).toBe(true);
      expect(info.rewardRate).toBeDefined();
    });
  });
});

describe('createHanzoNodeManager', () => {
  it('creates manager with config', () => {
    const manager = createHanzoNodeManager(TEST_CONFIG);

    expect(manager).toBeInstanceOf(HanzoNodeModelManager);
    expect(manager.engineId).toBe('hanzo-node');
  });
});
