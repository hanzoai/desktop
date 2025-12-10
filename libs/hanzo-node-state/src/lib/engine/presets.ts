/**
 * Engine presets - Pre-configured engines for common providers.
 *
 * Presets are templates for creating Engine instances.
 * They define defaults but can be overridden at creation time.
 */

import { createEngine, type Engine, type EngineConfig } from './types';

/**
 * Deployment type determines how the engine runs.
 */
export enum DeploymentType {
  /** Runs IN the app via Rust bindings (no HTTP) */
  Embedded = 'embedded',
  /** Separate process managed by the app */
  Sidecar = 'sidecar',
  /** User-managed external service */
  External = 'external',
}

/**
 * Engine preset configuration.
 */
export interface EnginePreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly deployment: DeploymentType;
  readonly defaultBaseUrl: string;
  readonly requiresApiKey: boolean;
  readonly features: {
    readonly streaming: boolean;
    readonly toolCalling: boolean;
    readonly vision: boolean;
    readonly embeddings: boolean;
  };
  readonly docsUrl?: string;
  readonly downloadUrl?: string;
}

// --- Embedded Engines (run IN the app) ---

export const HANZO_ENGINE_PRESET: EnginePreset = {
  id: 'hanzo-engine',
  name: 'Hanzo Engine',
  description: 'Direct Rust inference via Tauri bindings',
  deployment: DeploymentType.Embedded,
  defaultBaseUrl: '', // No HTTP - direct bindings
  requiresApiKey: false,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://docs.hanzo.ai/engine',
};

export const MLX_ENGINE_PRESET: EnginePreset = {
  id: 'mlx-engine',
  name: 'MLX Engine',
  description: 'Apple MLX inference for Apple Silicon (M1/M2/M3/M4)',
  deployment: DeploymentType.Embedded,
  defaultBaseUrl: '', // No HTTP - direct bindings
  requiresApiKey: false,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://github.com/ml-explore/mlx',
};

// --- Sidecar Engines (app-managed process) ---

export const OLLAMA_PRESET: EnginePreset = {
  id: 'ollama',
  name: 'Ollama',
  description: 'Local LLM runner with model management',
  deployment: DeploymentType.Sidecar,
  defaultBaseUrl: 'http://127.0.0.1:11434/v1',
  requiresApiKey: false,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://ollama.ai/docs',
  downloadUrl: 'https://ollama.ai/download',
};

export const HANZO_NODE_PRESET: EnginePreset = {
  id: 'hanzo-node',
  name: 'Hanzo Node',
  description: 'Blockchain-integrated AI with mining rewards',
  deployment: DeploymentType.Sidecar,
  defaultBaseUrl: 'http://127.0.0.1:9550/v1',
  requiresApiKey: true,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://docs.hanzo.ai/node',
};

// --- External Engines (user-managed) ---

export const LM_STUDIO_PRESET: EnginePreset = {
  id: 'lmstudio',
  name: 'LM Studio',
  description: 'Desktop app for local LLMs',
  deployment: DeploymentType.External,
  defaultBaseUrl: 'http://127.0.0.1:1234/v1',
  requiresApiKey: false,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://lmstudio.ai/docs',
  downloadUrl: 'https://lmstudio.ai',
};

export const OPENAI_PRESET: EnginePreset = {
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI API (GPT-4, GPT-3.5)',
  deployment: DeploymentType.External,
  defaultBaseUrl: 'https://api.openai.com/v1',
  requiresApiKey: true,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://platform.openai.com/docs',
};

export const ANTHROPIC_PRESET: EnginePreset = {
  id: 'anthropic',
  name: 'Anthropic',
  description: 'Anthropic API (Claude models)',
  deployment: DeploymentType.External,
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  requiresApiKey: true,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: false,
  },
  docsUrl: 'https://docs.anthropic.com',
};

export const GROQ_PRESET: EnginePreset = {
  id: 'groq',
  name: 'Groq',
  description: 'Fast inference on Groq hardware',
  deployment: DeploymentType.External,
  defaultBaseUrl: 'https://api.groq.com/openai/v1',
  requiresApiKey: true,
  features: {
    streaming: true,
    toolCalling: true,
    vision: false,
    embeddings: false,
  },
  docsUrl: 'https://console.groq.com/docs',
};

export const HANZO_GATEWAY_PRESET: EnginePreset = {
  id: 'hanzo-gateway',
  name: 'Hanzo Gateway',
  description: 'Unified cloud AI gateway',
  deployment: DeploymentType.External,
  defaultBaseUrl: 'https://api.hanzo.ai/v1',
  requiresApiKey: true,
  features: {
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  docsUrl: 'https://docs.hanzo.ai/gateway',
};

export const OPENAI_COMPATIBLE_PRESET: EnginePreset = {
  id: 'openai-compatible',
  name: 'OpenAI Compatible',
  description: 'Any OpenAI-compatible server',
  deployment: DeploymentType.External,
  defaultBaseUrl: 'http://localhost:8000/v1',
  requiresApiKey: false,
  features: {
    streaming: true,
    toolCalling: true,
    vision: false,
    embeddings: true,
  },
};

/**
 * All presets indexed by ID.
 */
export const ENGINE_PRESETS: Record<string, EnginePreset> = {
  [HANZO_ENGINE_PRESET.id]: HANZO_ENGINE_PRESET,
  [MLX_ENGINE_PRESET.id]: MLX_ENGINE_PRESET,
  [OLLAMA_PRESET.id]: OLLAMA_PRESET,
  [HANZO_NODE_PRESET.id]: HANZO_NODE_PRESET,
  [LM_STUDIO_PRESET.id]: LM_STUDIO_PRESET,
  [OPENAI_PRESET.id]: OPENAI_PRESET,
  [ANTHROPIC_PRESET.id]: ANTHROPIC_PRESET,
  [GROQ_PRESET.id]: GROQ_PRESET,
  [HANZO_GATEWAY_PRESET.id]: HANZO_GATEWAY_PRESET,
  [OPENAI_COMPATIBLE_PRESET.id]: OPENAI_COMPATIBLE_PRESET,
};

/**
 * Get a preset by ID.
 */
export function getPreset(id: string): EnginePreset | undefined {
  return ENGINE_PRESETS[id];
}

/**
 * Get all presets.
 */
export function getAllPresets(): EnginePreset[] {
  return Object.values(ENGINE_PRESETS);
}

/**
 * Get presets by deployment type.
 */
export function getPresetsByDeployment(deployment: DeploymentType): EnginePreset[] {
  return Object.values(ENGINE_PRESETS).filter((p) => p.deployment === deployment);
}

/**
 * Create an Engine from a preset with optional overrides.
 */
export function createFromPreset(
  presetId: string,
  overrides?: Partial<EngineConfig>,
): Engine {
  const preset = ENGINE_PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }

  const config: EngineConfig = {
    id: preset.id,
    name: preset.name,
    baseUrl: preset.defaultBaseUrl,
    ...overrides,
  };

  return createEngine(config);
}

// --- Convenience factory functions ---

export function createOpenAI(apiKey: string, model = 'gpt-4o'): Engine {
  return createFromPreset('openai', { apiKey, defaultModel: model });
}

export function createAnthropic(apiKey: string, model = 'claude-3-5-sonnet-20241022'): Engine {
  return createFromPreset('anthropic', { apiKey, defaultModel: model });
}

export function createGroq(apiKey: string, model = 'llama-3.3-70b-versatile'): Engine {
  return createFromPreset('groq', { apiKey, defaultModel: model });
}

export function createOllama(baseUrl = 'http://127.0.0.1:11434/v1', model?: string): Engine {
  return createFromPreset('ollama', { baseUrl, defaultModel: model });
}

export function createLMStudio(baseUrl = 'http://127.0.0.1:1234/v1', model?: string): Engine {
  return createFromPreset('lmstudio', { baseUrl, defaultModel: model });
}

export function createHanzoGateway(apiKey: string, model?: string): Engine {
  return createFromPreset('hanzo-gateway', { apiKey, defaultModel: model });
}

export function createHanzoNode(
  baseUrl: string,
  token: string,
  model?: string,
): Engine {
  return createFromPreset('hanzo-node', {
    baseUrl,
    apiKey: token,
    defaultModel: model,
  });
}
