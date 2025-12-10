/**
 * Engine architecture tests.
 *
 * Verifies the simplified Engine interface works correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  createEngine,
  createOpenAI,
  createOllama,
  createFromPreset,
  DeploymentType,
  getAllPresets,
  getPreset,
  getPresetsByDeployment,
  type Engine,
  type EngineConfig,
} from './index';

describe('Engine', () => {
  describe('createEngine', () => {
    it('creates an engine with minimal config', () => {
      const engine = createEngine({
        id: 'test',
        name: 'Test Engine',
        baseUrl: 'http://localhost:8000/v1',
      });

      expect(engine.id).toBe('test');
      expect(engine.name).toBe('Test Engine');
      expect(engine.baseUrl).toBe('http://localhost:8000/v1');
      expect(engine.apiKey).toBeUndefined();
    });

    it('creates an engine with full config', () => {
      const config: EngineConfig = {
        id: 'full',
        name: 'Full Engine',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        defaultModel: 'gpt-4',
        timeout: 60000,
      };

      const engine = createEngine(config);

      expect(engine.id).toBe('full');
      expect(engine.apiKey).toBe('sk-test');
    });

    it('strips trailing slash from baseUrl', () => {
      const engine = createEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000/v1/',
      });

      expect(engine.baseUrl).toBe('http://localhost:8000/v1');
    });
  });

  describe('Engine interface', () => {
    it('has required methods', () => {
      const engine: Engine = createEngine({
        id: 'test',
        name: 'Test',
        baseUrl: 'http://localhost:8000',
      });

      // Verify interface methods exist
      expect(typeof engine.chat).toBe('function');
      expect(typeof engine.complete).toBe('function');
      expect(typeof engine.embed).toBe('function');
      expect(typeof engine.listModels).toBe('function');
    });
  });
});

describe('Presets', () => {
  describe('getAllPresets', () => {
    it('returns all defined presets', () => {
      const presets = getAllPresets();

      expect(presets.length).toBeGreaterThan(0);
      expect(presets.some((p) => p.id === 'ollama')).toBe(true);
      expect(presets.some((p) => p.id === 'openai')).toBe(true);
      expect(presets.some((p) => p.id === 'hanzo-node')).toBe(true);
    });
  });

  describe('getPreset', () => {
    it('returns preset by ID', () => {
      const ollama = getPreset('ollama');
      expect(ollama).toBeDefined();
      expect(ollama?.id).toBe('ollama');
      expect(ollama?.name).toBe('Ollama');
    });

    it('returns undefined for unknown preset', () => {
      const unknown = getPreset('unknown-preset');
      expect(unknown).toBeUndefined();
    });
  });

  describe('getPresetsByDeployment', () => {
    it('returns embedded presets', () => {
      const embedded = getPresetsByDeployment(DeploymentType.Embedded);
      expect(embedded.some((p) => p.id === 'hanzo-engine')).toBe(true);
    });

    it('returns sidecar presets', () => {
      const sidecars = getPresetsByDeployment(DeploymentType.Sidecar);
      expect(sidecars.some((p) => p.id === 'ollama')).toBe(true);
      expect(sidecars.some((p) => p.id === 'hanzo-node')).toBe(true);
    });

    it('returns external presets', () => {
      const external = getPresetsByDeployment(DeploymentType.External);
      expect(external.some((p) => p.id === 'openai')).toBe(true);
      expect(external.some((p) => p.id === 'anthropic')).toBe(true);
      expect(external.some((p) => p.id === 'groq')).toBe(true);
    });
  });

  describe('createFromPreset', () => {
    it('creates engine from preset with defaults', () => {
      const engine = createFromPreset('ollama');

      expect(engine.id).toBe('ollama');
      expect(engine.name).toBe('Ollama');
      expect(engine.baseUrl).toBe('http://127.0.0.1:11434/v1');
    });

    it('allows overriding preset values', () => {
      const engine = createFromPreset('ollama', {
        baseUrl: 'http://192.168.1.100:11434/v1',
        defaultModel: 'llama3.2:3b',
      });

      expect(engine.baseUrl).toBe('http://192.168.1.100:11434/v1');
    });

    it('throws for unknown preset', () => {
      expect(() => createFromPreset('unknown')).toThrow('Unknown preset');
    });
  });
});

describe('Convenience factories', () => {
  describe('createOpenAI', () => {
    it('creates OpenAI engine with API key', () => {
      const engine = createOpenAI('sk-test');

      expect(engine.id).toBe('openai');
      expect(engine.apiKey).toBe('sk-test');
      expect(engine.baseUrl).toBe('https://api.openai.com/v1');
    });

    it('allows custom model', () => {
      const engine = createOpenAI('sk-test', 'gpt-4o-mini');
      // Model is stored internally, verify engine was created
      expect(engine.id).toBe('openai');
    });
  });

  describe('createOllama', () => {
    it('creates Ollama engine with defaults', () => {
      const engine = createOllama();

      expect(engine.id).toBe('ollama');
      expect(engine.baseUrl).toBe('http://127.0.0.1:11434/v1');
      expect(engine.apiKey).toBeUndefined();
    });

    it('allows custom base URL', () => {
      const engine = createOllama('http://192.168.1.100:11434/v1');
      expect(engine.baseUrl).toBe('http://192.168.1.100:11434/v1');
    });
  });
});

describe('DeploymentType', () => {
  it('has correct values', () => {
    expect(DeploymentType.Embedded).toBe('embedded');
    expect(DeploymentType.Sidecar).toBe('sidecar');
    expect(DeploymentType.External).toBe('external');
  });
});
