/**
 * Engine configuration for each supported local AI engine.
 *
 * Contains static configuration: URLs, display names, descriptions,
 * and engine-specific benefits/capabilities.
 */

import { LocalAIEngine, ModelCapability } from './types';

/**
 * Engine-specific benefit for UI display.
 */
export interface EngineBenefit {
  /** Short title */
  readonly title: string;
  /** Longer description */
  readonly description: string;
  /** Icon identifier (optional) */
  readonly icon?: string;
}

/**
 * Static configuration for an engine.
 */
export interface EngineConfig {
  /** Engine identifier */
  readonly engine: LocalAIEngine;
  /** Display name */
  readonly name: string;
  /** Short description */
  readonly description: string;
  /** Default API URL */
  readonly defaultApiUrl: string;
  /** Default API port */
  readonly defaultPort: number;
  /** Health check endpoint path */
  readonly healthEndpoint: string;
  /** Models list endpoint path */
  readonly modelsEndpoint: string;
  /** Whether this is the default/recommended engine */
  readonly isDefault: boolean;
  /** Unique benefits of this engine */
  readonly benefits: readonly EngineBenefit[];
  /** Supported model capabilities */
  readonly supportedCapabilities: readonly ModelCapability[];
  /** External documentation URL */
  readonly docsUrl?: string;
  /** Download/installation URL */
  readonly downloadUrl?: string;
}

/**
 * Hanzo Node configuration.
 *
 * Default engine with blockchain integration and mining rewards.
 */
export const HANZO_NODE_CONFIG: EngineConfig = {
  engine: LocalAIEngine.HanzoNode,
  name: 'Hanzo Node',
  description:
    'Blockchain-integrated local AI with mining rewards. Run AI locally and earn tokens.',
  defaultApiUrl: 'http://127.0.0.1',
  defaultPort: 9550,
  healthEndpoint: '/v2/health',
  modelsEndpoint: '/v2/scan_ollama_models',
  isDefault: true,
  benefits: [
    {
      title: 'Mining Rewards',
      description:
        'Earn HANZO tokens by running AI workloads and contributing to the network.',
      icon: 'coins',
    },
    {
      title: 'Blockchain Integration',
      description:
        'On-chain model verification, provenance tracking, and decentralized inference.',
      icon: 'link',
    },
    {
      title: 'Privacy First',
      description:
        'All inference runs locally. Your data never leaves your machine.',
      icon: 'shield',
    },
    {
      title: 'Network Effects',
      description:
        'Access shared compute resources and model caching across the Hanzo network.',
      icon: 'network',
    },
  ],
  supportedCapabilities: [
    ModelCapability.TextGeneration,
    ModelCapability.Vision,
    ModelCapability.Thinking,
    ModelCapability.ToolCalling,
    ModelCapability.Embedding,
    ModelCapability.Code,
  ],
  docsUrl: 'https://docs.hanzo.ai/node',
};

/**
 * Ollama configuration.
 *
 * Popular open-source local LLM runner.
 */
export const OLLAMA_CONFIG: EngineConfig = {
  engine: LocalAIEngine.Ollama,
  name: 'Ollama',
  description: 'Simple, fast local LLM runner. Easy model management and API.',
  defaultApiUrl: 'http://127.0.0.1',
  defaultPort: 11434,
  healthEndpoint: '/api/version',
  modelsEndpoint: '/api/tags',
  isDefault: false,
  benefits: [
    {
      title: 'Easy Setup',
      description:
        'One-line installation and simple CLI for model management.',
      icon: 'terminal',
    },
    {
      title: 'Large Model Library',
      description:
        'Access thousands of pre-quantized models from the Ollama library.',
      icon: 'library',
    },
    {
      title: 'OpenAI-Compatible API',
      description:
        'Drop-in replacement API compatible with OpenAI client libraries.',
      icon: 'api',
    },
  ],
  supportedCapabilities: [
    ModelCapability.TextGeneration,
    ModelCapability.Vision,
    ModelCapability.Thinking,
    ModelCapability.ToolCalling,
    ModelCapability.Embedding,
    ModelCapability.Code,
  ],
  docsUrl: 'https://ollama.ai/docs',
  downloadUrl: 'https://ollama.ai/download',
};

/**
 * LM Studio configuration.
 *
 * Desktop application for running local LLMs.
 */
export const LM_STUDIO_CONFIG: EngineConfig = {
  engine: LocalAIEngine.LMStudio,
  name: 'LM Studio',
  description:
    'Desktop app for discovering, downloading, and running local LLMs.',
  defaultApiUrl: 'http://127.0.0.1',
  defaultPort: 1234,
  healthEndpoint: '/v1/models',
  modelsEndpoint: '/v1/models',
  isDefault: false,
  benefits: [
    {
      title: 'Visual Interface',
      description:
        'GUI for browsing, downloading, and configuring models without CLI.',
      icon: 'window',
    },
    {
      title: 'Model Discovery',
      description:
        'Browse and search Hugging Face models directly from the app.',
      icon: 'search',
    },
    {
      title: 'Chat Interface',
      description: 'Built-in chat UI for testing models before integration.',
      icon: 'chat',
    },
  ],
  supportedCapabilities: [
    ModelCapability.TextGeneration,
    ModelCapability.Vision,
    ModelCapability.Code,
  ],
  docsUrl: 'https://lmstudio.ai/docs',
  downloadUrl: 'https://lmstudio.ai',
};

/**
 * All engine configurations indexed by engine type.
 */
export const ENGINE_CONFIGS: Record<LocalAIEngine, EngineConfig> = {
  [LocalAIEngine.HanzoNode]: HANZO_NODE_CONFIG,
  [LocalAIEngine.Ollama]: OLLAMA_CONFIG,
  [LocalAIEngine.LMStudio]: LM_STUDIO_CONFIG,
};

/**
 * Get configuration for an engine.
 */
export function getEngineConfig(engine: LocalAIEngine): EngineConfig {
  return ENGINE_CONFIGS[engine];
}

/**
 * Get the default engine configuration.
 */
export function getDefaultEngineConfig(): EngineConfig {
  return HANZO_NODE_CONFIG;
}

/**
 * Get all engine configurations.
 */
export function getAllEngineConfigs(): readonly EngineConfig[] {
  return Object.values(ENGINE_CONFIGS);
}

/**
 * Build full API URL for an engine.
 */
export function buildApiUrl(
  engine: LocalAIEngine,
  port?: number,
  host?: string,
): string {
  const config = getEngineConfig(engine);
  const effectiveHost = host ?? config.defaultApiUrl;
  const effectivePort = port ?? config.defaultPort;
  return `${effectiveHost}:${effectivePort}`;
}

/**
 * Build health check URL for an engine.
 */
export function buildHealthUrl(
  engine: LocalAIEngine,
  port?: number,
  host?: string,
): string {
  const config = getEngineConfig(engine);
  return `${buildApiUrl(engine, port, host)}${config.healthEndpoint}`;
}

/**
 * Build models endpoint URL for an engine.
 */
export function buildModelsUrl(
  engine: LocalAIEngine,
  port?: number,
  host?: string,
): string {
  const config = getEngineConfig(engine);
  return `${buildApiUrl(engine, port, host)}${config.modelsEndpoint}`;
}
