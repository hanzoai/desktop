/**
 * Hanzo Engine Client Tests
 *
 * Tests for the embedded engine HTTP client.
 * These tests run against the live engine on localhost:36900.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HanzoEngineClient, HANZO_ENGINE_BASE_URL } from './client';
import type { EngineStatus, ChatMessage } from './types';
import { ModelFormat, detectModelFormat } from './types';

// Test against live engine or mock
const USE_LIVE_ENGINE = process.env.TEST_LIVE_ENGINE === 'true';

describe('HanzoEngineClient', () => {
  let client: HanzoEngineClient;

  beforeAll(() => {
    client = new HanzoEngineClient(HANZO_ENGINE_BASE_URL);
  });

  describe('isAvailable', () => {
    it('should check if engine is available', async () => {
      const available = await client.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  // Only run live tests when engine is running
  if (USE_LIVE_ENGINE) {
    describe('Live Engine Tests', () => {
      describe('getStatus', () => {
        it('should return engine status', async () => {
          const status = await client.getStatus();

          expect(status).toHaveProperty('initialized');
          expect(status).toHaveProperty('device');
          expect(status).toHaveProperty('is_busy');
          expect(typeof status.initialized).toBe('boolean');
          expect(typeof status.device).toBe('string');
          expect(typeof status.is_busy).toBe('boolean');
        });

        it('should detect metal device on macOS', async () => {
          const status = await client.getStatus();
          // On macOS with Metal, device should be 'metal'
          if (process.platform === 'darwin') {
            expect(status.device).toBe('metal');
          }
        });
      });

      describe('listModels', () => {
        it('should return models list', async () => {
          const models = await client.listModels();

          expect(models).toHaveProperty('object', 'list');
          expect(models).toHaveProperty('data');
          expect(Array.isArray(models.data)).toBe(true);
        });
      });

      describe('chat', () => {
        it('should fail gracefully when no model is loaded', async () => {
          const status = await client.getStatus();

          if (!status.initialized) {
            // Should throw error when no model loaded
            await expect(
              client.chat([{ role: 'user', content: 'Hello' }])
            ).rejects.toThrow();
          }
        });
      });
    });
  }

  describe('Client Configuration', () => {
    it('should use default base URL', () => {
      expect(HANZO_ENGINE_BASE_URL).toBe('http://127.0.0.1:36900');
    });

    it('should allow custom base URL', () => {
      const customClient = new HanzoEngineClient('http://localhost:8080');
      expect(customClient).toBeInstanceOf(HanzoEngineClient);
    });
  });

  describe('Request Formatting', () => {
    it('should format chat messages correctly', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      // Verify message structure
      messages.forEach((msg) => {
        expect(['system', 'user', 'assistant']).toContain(msg.role);
        expect(typeof msg.content).toBe('string');
      });
    });
  });
});

describe('EngineStatus Type', () => {
  it('should have correct structure', () => {
    const mockStatus: EngineStatus = {
      initialized: false,
      loaded_model: null,
      device: 'metal',
      memory_usage: null,
      is_busy: false,
    };

    expect(mockStatus.initialized).toBe(false);
    expect(mockStatus.loaded_model).toBeNull();
    expect(mockStatus.device).toBe('metal');
    expect(mockStatus.memory_usage).toBeNull();
    expect(mockStatus.is_busy).toBe(false);
  });

  it('should allow loaded model', () => {
    const mockStatus: EngineStatus = {
      initialized: true,
      loaded_model: 'test-model.gguf',
      device: 'metal',
      memory_usage: 1024,
      is_busy: true,
    };

    expect(mockStatus.initialized).toBe(true);
    expect(mockStatus.loaded_model).toBe('test-model.gguf');
    expect(mockStatus.memory_usage).toBe(1024);
    expect(mockStatus.is_busy).toBe(true);
  });
});

describe('Model Format Detection', () => {
  describe('GGUF format', () => {
    it('should detect .gguf file extension', () => {
      expect(detectModelFormat('model.gguf')).toBe(ModelFormat.Gguf);
      expect(detectModelFormat('path/to/model.gguf')).toBe(ModelFormat.Gguf);
    });

    it('should detect GGUF in path', () => {
      expect(detectModelFormat('TheBloke/Llama-2-7B-GGUF')).toBe(ModelFormat.Gguf);
      expect(detectModelFormat('/path/to/models/gguf/model.bin')).toBe(ModelFormat.Gguf);
    });

    it('should detect -gguf suffix in repo name', () => {
      expect(detectModelFormat('bartowski/Meta-Llama-3.1-8B-gguf')).toBe(ModelFormat.Gguf);
    });
  });

  describe('MLX format', () => {
    it('should detect mlx-community prefix', () => {
      expect(detectModelFormat('mlx-community/Llama-3.2-3B-4bit')).toBe(ModelFormat.MlxQuantized);
      expect(detectModelFormat('mlx-community/Qwen2.5-7B-4bit')).toBe(ModelFormat.MlxQuantized);
    });

    it('should detect -mlx suffix', () => {
      expect(detectModelFormat('org/model-mlx-4bit')).toBe(ModelFormat.MlxQuantized);
    });

    it('should detect /mlx- pattern', () => {
      expect(detectModelFormat('user/mlx-model')).toBe(ModelFormat.MlxQuantized);
    });
  });

  describe('UQFF format', () => {
    it('should detect .uqff file extension', () => {
      expect(detectModelFormat('model.uqff')).toBe(ModelFormat.Uqff);
    });

    it('should detect uqff in path', () => {
      expect(detectModelFormat('org/model-uqff')).toBe(ModelFormat.Uqff);
    });
  });

  describe('Safetensors format', () => {
    it('should default to safetensors for HuggingFace repos', () => {
      expect(detectModelFormat('meta-llama/Llama-3.2-3B-Instruct')).toBe(ModelFormat.Safetensors);
      expect(detectModelFormat('microsoft/Phi-3.5-mini-instruct')).toBe(ModelFormat.Safetensors);
      expect(detectModelFormat('Qwen/Qwen2.5-7B-Instruct')).toBe(ModelFormat.Safetensors);
    });
  });

  describe('Auto format', () => {
    it('should default to auto for local paths', () => {
      expect(detectModelFormat('/local/path/model')).toBe(ModelFormat.Auto);
      expect(detectModelFormat('/Users/user/models/mymodel')).toBe(ModelFormat.Auto);
    });

    it('should default to auto for simple names', () => {
      expect(detectModelFormat('my-local-model')).toBe(ModelFormat.Auto);
    });
  });
});

describe('ModelFormat enum', () => {
  it('should have all expected values', () => {
    expect(ModelFormat.Gguf).toBe('gguf');
    expect(ModelFormat.Safetensors).toBe('safetensors');
    expect(ModelFormat.MlxQuantized).toBe('mlx');
    expect(ModelFormat.Uqff).toBe('uqff');
    expect(ModelFormat.Auto).toBe('auto');
  });
});
