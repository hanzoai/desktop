/**
 * Tests for ModelManager factory and exports.
 */

import { describe, it, expect, vi } from 'vitest';
import { LocalAIEngine } from '../local-ai/types';
import {
  createModelManager,
  hasModelManager,
  isOllamaManager,
  isHanzoNodeManager,
  ENGINES_WITH_MODEL_MANAGER,
  OllamaModelManager,
  HanzoNodeModelManager,
} from './index';

// Mock the Hanzo Node API
vi.mock('@hanzo_network/hanzo-message-ts/api/ollama', () => ({
  scanOllamaModels: vi.fn(),
  addOllamaModels: vi.fn(),
}));

describe('createModelManager', () => {
  it('creates Ollama manager with string engine', () => {
    const manager = createModelManager({ engine: 'ollama' });

    expect(manager).not.toBeNull();
    expect(manager?.engineId).toBe('ollama');
  });

  it('creates Ollama manager with LocalAIEngine enum', () => {
    const manager = createModelManager({ engine: LocalAIEngine.Ollama });

    expect(manager).not.toBeNull();
    expect(manager?.engineId).toBe('ollama');
  });

  it('creates Ollama manager with custom config', () => {
    const manager = createModelManager({
      engine: 'ollama',
      config: { host: 'http://192.168.1.100:11434' },
    });

    expect(manager).not.toBeNull();
    expect(manager?.engineId).toBe('ollama');
  });

  it('creates Hanzo Node manager with string engine', () => {
    const manager = createModelManager({
      engine: 'hanzo-node',
      config: { nodeAddress: 'http://127.0.0.1:9550', token: 'test' },
    });

    expect(manager).not.toBeNull();
    expect(manager?.engineId).toBe('hanzo-node');
  });

  it('creates Hanzo Node manager with LocalAIEngine enum', () => {
    const manager = createModelManager({
      engine: LocalAIEngine.HanzoNode,
      config: { nodeAddress: 'http://127.0.0.1:9550', token: 'test' },
    });

    expect(manager).not.toBeNull();
    expect(manager?.engineId).toBe('hanzo-node');
  });

  it('returns null for unsupported engine', () => {
    const manager = createModelManager({
      engine: 'unknown-engine' as any,
      config: undefined as any,
    });

    expect(manager).toBeNull();
  });
});

describe('hasModelManager', () => {
  it('returns true for Ollama', () => {
    expect(hasModelManager('ollama')).toBe(true);
    expect(hasModelManager(LocalAIEngine.Ollama)).toBe(true);
  });

  it('returns true for Hanzo Node', () => {
    expect(hasModelManager('hanzo-node')).toBe(true);
    expect(hasModelManager(LocalAIEngine.HanzoNode)).toBe(true);
  });

  it('returns false for LM Studio (not yet implemented)', () => {
    expect(hasModelManager('lmstudio')).toBe(false);
    expect(hasModelManager(LocalAIEngine.LMStudio)).toBe(false);
  });

  it('returns false for cloud engines', () => {
    expect(hasModelManager('openai')).toBe(false);
    expect(hasModelManager('anthropic')).toBe(false);
  });
});

describe('type guards', () => {
  it('isOllamaManager returns true for Ollama manager', () => {
    const manager = createModelManager({ engine: 'ollama' })!;
    expect(isOllamaManager(manager)).toBe(true);
    expect(isHanzoNodeManager(manager)).toBe(false);
  });

  it('isHanzoNodeManager returns true for Hanzo Node manager', () => {
    const manager = createModelManager({
      engine: 'hanzo-node',
      config: { nodeAddress: 'http://127.0.0.1:9550', token: 'test' },
    })!;
    expect(isHanzoNodeManager(manager)).toBe(true);
    expect(isOllamaManager(manager)).toBe(false);
  });
});

describe('ENGINES_WITH_MODEL_MANAGER', () => {
  it('includes Ollama and Hanzo Node', () => {
    expect(ENGINES_WITH_MODEL_MANAGER).toContain(LocalAIEngine.Ollama);
    expect(ENGINES_WITH_MODEL_MANAGER).toContain(LocalAIEngine.HanzoNode);
  });

  it('does not include LM Studio yet', () => {
    expect(ENGINES_WITH_MODEL_MANAGER).not.toContain(LocalAIEngine.LMStudio);
  });
});

describe('exports', () => {
  it('exports manager classes', () => {
    expect(OllamaModelManager).toBeDefined();
    expect(HanzoNodeModelManager).toBeDefined();
  });
});
