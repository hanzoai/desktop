/**
 * Engine presets for common AI providers.
 *
 * Each preset contains static configuration for an engine type.
 * Use these as templates when creating engine instances.
 */

import { ModelCapability } from './types';

/**
 * Engine category.
 */
export enum EngineCategory {
  /** Local engines running on user's machine */
  Local = 'local',
  /** Cloud API providers */
  Cloud = 'cloud',
  /** Self-hosted servers */
  SelfHosted = 'self-hosted',
}

/**
 * Engine feature flags.
 */
export interface EngineFeatures {
  /** Supports OpenAI-compatible API */
  readonly openaiCompatible: boolean;
  /** Supports model management (pull/remove) */
  readonly modelManagement: boolean;
  /** Supports streaming responses */
  readonly streaming: boolean;
  /** Supports function/tool calling */
  readonly toolCalling: boolean;
  /** Supports vision/image input */
  readonly vision: boolean;
  /** Supports embeddings */
  readonly embeddings: boolean;
}

/**
 * Engine UI benefit for display.
 */
export interface EngineBenefit {
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
}

/**
 * Engine preset configuration.
 */
export interface EnginePreset {
  /** Unique preset identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Short description */
  readonly description: string;
  /** Category */
  readonly category: EngineCategory;
  /** Default base URL */
  readonly defaultBaseUrl: string;
  /** Health check endpoint */
  readonly healthEndpoint: string;
  /** Models list endpoint */
  readonly modelsEndpoint: string;
  /** Whether API key is required */
  readonly requiresApiKey: boolean;
  /** Engine features */
  readonly features: EngineFeatures;
  /** Unique benefits for UI */
  readonly benefits: readonly EngineBenefit[];
  /** Supported model capabilities */
  readonly supportedCapabilities: readonly ModelCapability[];
  /** Documentation URL */
  readonly docsUrl?: string;
  /** Download/setup URL */
  readonly downloadUrl?: string;
  /** Whether this is the recommended default */
  readonly isDefault?: boolean;
}

/**
 * Ollama preset.
 * Popular local LLM runner with OpenAI-compatible API.
 */
export const OLLAMA_PRESET: EnginePreset = {
  id: 'ollama',
  name: 'Ollama',
  description: 'Simple, fast local LLM runner with OpenAI-compatible API',
  category: EngineCategory.Local,
  defaultBaseUrl: 'http://127.0.0.1:11434',
  healthEndpoint: '/api/version',
  modelsEndpoint: '/api/tags',
  requiresApiKey: false,
  features: {
    openaiCompatible: true,
    modelManagement: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  benefits: [
    {
      title: 'Easy Setup',
      description: 'One-line installation, simple CLI for model management',
      icon: 'terminal',
    },
    {
      title: 'Large Model Library',
      description: 'Access thousands of pre-quantized models',
      icon: 'library',
    },
    {
      title: 'OpenAI Compatible',
      description: 'Drop-in replacement for OpenAI client libraries',
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
 * LM Studio preset.
 * Desktop application for running local LLMs.
 */
export const LM_STUDIO_PRESET: EnginePreset = {
  id: 'lmstudio',
  name: 'LM Studio',
  description: 'Desktop app for discovering, downloading, and running LLMs',
  category: EngineCategory.Local,
  defaultBaseUrl: 'http://127.0.0.1:1234',
  healthEndpoint: '/v1/models',
  modelsEndpoint: '/v1/models',
  requiresApiKey: false,
  features: {
    openaiCompatible: true,
    modelManagement: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  benefits: [
    {
      title: 'Visual Interface',
      description: 'GUI for browsing and configuring models',
      icon: 'window',
    },
    {
      title: 'Model Discovery',
      description: 'Browse Hugging Face models directly from the app',
      icon: 'search',
    },
    {
      title: 'Built-in Chat',
      description: 'Test models before integration',
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
 * Hanzo Node preset.
 * Blockchain-integrated local AI with mining rewards.
 */
export const HANZO_NODE_PRESET: EnginePreset = {
  id: 'hanzo-node',
  name: 'Hanzo Node',
  description: 'Blockchain-integrated AI with mining rewards',
  category: EngineCategory.Local,
  defaultBaseUrl: 'http://127.0.0.1:9550',
  healthEndpoint: '/v2/health',
  modelsEndpoint: '/v2/scan_ollama_models',
  requiresApiKey: true,
  features: {
    openaiCompatible: true,
    modelManagement: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  benefits: [
    {
      title: 'Mining Rewards',
      description: 'Earn HANZO tokens by running AI workloads',
      icon: 'coins',
    },
    {
      title: 'Blockchain Verified',
      description: 'On-chain model verification and provenance',
      icon: 'shield',
    },
    {
      title: 'Privacy First',
      description: 'All inference runs locally, data never leaves',
      icon: 'lock',
    },
    {
      title: 'Network Effects',
      description: 'Access shared compute and model caching',
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
  isDefault: true,
};

/**
 * Hanzo Gateway preset.
 * Hanzo's cloud AI gateway for hosted models.
 */
export const HANZO_GATEWAY_PRESET: EnginePreset = {
  id: 'hanzo-gateway',
  name: 'Hanzo Gateway',
  description: 'Cloud AI gateway with unified model access',
  category: EngineCategory.Cloud,
  defaultBaseUrl: 'https://api.hanzo.ai/v1',
  healthEndpoint: '/models',
  modelsEndpoint: '/models',
  requiresApiKey: true,
  features: {
    openaiCompatible: true,
    modelManagement: false,
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  benefits: [
    {
      title: 'Unified Access',
      description: 'Single API for multiple model providers',
      icon: 'hub',
    },
    {
      title: 'No Setup',
      description: 'No local installation required',
      icon: 'cloud',
    },
    {
      title: 'Pay Per Use',
      description: 'Only pay for what you use',
      icon: 'coins',
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
  docsUrl: 'https://docs.hanzo.ai/gateway',
};

/**
 * OpenAI preset.
 */
export const OPENAI_PRESET: EnginePreset = {
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI API (GPT-4, GPT-3.5, etc.)',
  category: EngineCategory.Cloud,
  defaultBaseUrl: 'https://api.openai.com/v1',
  healthEndpoint: '/models',
  modelsEndpoint: '/models',
  requiresApiKey: true,
  features: {
    openaiCompatible: true,
    modelManagement: false,
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: true,
  },
  benefits: [
    {
      title: 'State of the Art',
      description: 'Access to latest GPT models',
      icon: 'star',
    },
    {
      title: 'Reliable',
      description: 'High availability and low latency',
      icon: 'shield',
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
  docsUrl: 'https://platform.openai.com/docs',
};

/**
 * Anthropic preset.
 */
export const ANTHROPIC_PRESET: EnginePreset = {
  id: 'anthropic',
  name: 'Anthropic',
  description: 'Anthropic API (Claude models)',
  category: EngineCategory.Cloud,
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  healthEndpoint: '/models',
  modelsEndpoint: '/models',
  requiresApiKey: true,
  features: {
    openaiCompatible: false, // Uses different API format
    modelManagement: false,
    streaming: true,
    toolCalling: true,
    vision: true,
    embeddings: false,
  },
  benefits: [
    {
      title: 'Advanced Reasoning',
      description: 'Claude models excel at complex tasks',
      icon: 'brain',
    },
    {
      title: 'Long Context',
      description: 'Support for very long conversations',
      icon: 'file-text',
    },
  ],
  supportedCapabilities: [
    ModelCapability.TextGeneration,
    ModelCapability.Vision,
    ModelCapability.Thinking,
    ModelCapability.ToolCalling,
    ModelCapability.Code,
  ],
  docsUrl: 'https://docs.anthropic.com',
};

/**
 * Generic OpenAI-compatible preset.
 * Template for custom OpenAI-compatible servers.
 */
export const OPENAI_COMPATIBLE_PRESET: EnginePreset = {
  id: 'openai-compatible',
  name: 'OpenAI Compatible',
  description: 'Any OpenAI-compatible server (vLLM, TGI, etc.)',
  category: EngineCategory.SelfHosted,
  defaultBaseUrl: 'http://localhost:8000/v1',
  healthEndpoint: '/models',
  modelsEndpoint: '/models',
  requiresApiKey: false,
  features: {
    openaiCompatible: true,
    modelManagement: false,
    streaming: true,
    toolCalling: true,
    vision: false,
    embeddings: true,
  },
  benefits: [
    {
      title: 'Flexible',
      description: 'Works with any OpenAI-compatible server',
      icon: 'puzzle',
    },
    {
      title: 'Self-Hosted',
      description: 'Full control over your infrastructure',
      icon: 'server',
    },
  ],
  supportedCapabilities: [
    ModelCapability.TextGeneration,
    ModelCapability.Embedding,
    ModelCapability.Code,
  ],
};

/**
 * All engine presets indexed by ID.
 */
export const ENGINE_PRESETS: Record<string, EnginePreset> = {
  [OLLAMA_PRESET.id]: OLLAMA_PRESET,
  [LM_STUDIO_PRESET.id]: LM_STUDIO_PRESET,
  [HANZO_NODE_PRESET.id]: HANZO_NODE_PRESET,
  [HANZO_GATEWAY_PRESET.id]: HANZO_GATEWAY_PRESET,
  [OPENAI_PRESET.id]: OPENAI_PRESET,
  [ANTHROPIC_PRESET.id]: ANTHROPIC_PRESET,
  [OPENAI_COMPATIBLE_PRESET.id]: OPENAI_COMPATIBLE_PRESET,
};

/**
 * Get a preset by ID.
 */
export function getEnginePreset(id: string): EnginePreset | undefined {
  return ENGINE_PRESETS[id];
}

/**
 * Get the default engine preset.
 */
export function getDefaultPreset(): EnginePreset {
  return HANZO_NODE_PRESET;
}

/**
 * Get all presets.
 */
export function getAllPresets(): readonly EnginePreset[] {
  return Object.values(ENGINE_PRESETS);
}

/**
 * Get presets by category.
 */
export function getPresetsByCategory(
  category: EngineCategory,
): readonly EnginePreset[] {
  return Object.values(ENGINE_PRESETS).filter((p) => p.category === category);
}

/**
 * Get presets that support model management.
 */
export function getModelManagerPresets(): readonly EnginePreset[] {
  return Object.values(ENGINE_PRESETS).filter(
    (p) => p.features.modelManagement,
  );
}

// Legacy exports for backwards compatibility
export {
  HANZO_NODE_PRESET as HANZO_NODE_CONFIG,
  OLLAMA_PRESET as OLLAMA_CONFIG,
  LM_STUDIO_PRESET as LM_STUDIO_CONFIG,
};
