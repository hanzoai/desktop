import { platform } from '@tauri-apps/plugin-os';

import { ModelProvider } from '../../components/ais/constants';
import OLLAMA_MODELS_REPOSITORY from './ollama-models-repository.json';

export enum OllamaModelQuality {
  Low = 'low',
  Medium = 'medium',
  Good = 'good',
  Excellent = 'excellent',
}

export enum OllamaModelSpeed {
  Average = 'average',
  Fast = 'fast',
  VeryFast = 'very-fast',
}

export enum OllamaModelCapability {
  TextGeneration = 'text-generation',
  ImageToText = 'image-to-text',
  Thinking = 'thinking',
  ToolCalling = 'tool-calling',
  Cloud = 'cloud',
}

export interface OllamaModel {
  model: string;
  tag: string;
  name: string;
  description: string;
  contextLength: number;
  quality: OllamaModelQuality;
  speed: OllamaModelSpeed;
  capabilities: OllamaModelCapability[];
  size: number; // Size in GB
  fullName: string;
  provider?: string;
}
export type OllamaModelDefinition =
  (typeof FILTERED_OLLAMA_MODELS_REPOSITORY)[0];

export const FILTERED_OLLAMA_MODELS_REPOSITORY =
  OLLAMA_MODELS_REPOSITORY.filter((model) => !model.embedding);
export const ALLOWED_OLLAMA_MODELS = FILTERED_OLLAMA_MODELS_REPOSITORY.flatMap(
  (model) => model.tags.map((tag) => tag.name),
);

// Helper function to convert JSON model properties to capabilities array
export function getCapabilitiesFromModel(model: OllamaModelDefinition): OllamaModelCapability[] {
  const capabilities: OllamaModelCapability[] = [OllamaModelCapability.TextGeneration];
  
  if (model.vision) {
    capabilities.push(OllamaModelCapability.ImageToText);
  }
  if (model.thinking) {
    capabilities.push(OllamaModelCapability.Thinking);
  }
  if (model.supportTools) {
    capabilities.push(OllamaModelCapability.ToolCalling);
  }
  if (model.cloud) {
    capabilities.push(OllamaModelCapability.Cloud);
  }
  
  return capabilities;
}

// Safely get platform - may fail in browser context
let currentPlatform: string | undefined;
try {
  currentPlatform = platform();
} catch {
  currentPlatform = undefined;
}

// Pre-installed models for onboarding selection
export const PREINSTALLED_MODELS: OllamaModel[] = [
  // Zen4 family models from huggingface.co/zenlm
  {
    model: 'qwen3',
    tag: '4b-instruct-2507',
    name: 'Zen4 Mini',
    description:
      'Compact Zen4 family model. Fast reasoning and tool use with minimal footprint. From ZenLM - open models for mindful AI use.',
    contextLength: 32768,
    quality: OllamaModelQuality.Medium,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 2.5,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'qwen3',
    tag: '8b',
    name: 'Zen4',
    description:
      'Core Zen4 family model. Strong reasoning, thinking, and tool calling for everyday tasks. From ZenLM - open models for mindful AI use.',
    contextLength: 32768,
    quality: OllamaModelQuality.Medium,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 5.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'qwen3',
    tag: '14b',
    name: 'Zen4 Pro',
    description:
      'Professional Zen4 family model. High-quality reasoning and deep understanding for demanding tasks. From ZenLM - open models for mindful AI use.',
    contextLength: 32768,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Average,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 9.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'qwen3',
    tag: '30b-a3b-instruct-2507',
    name: 'Zen4 Max',
    description:
      'High-capacity Zen4 family MoE model. 30B parameters with 3B active for fast, high-quality reasoning with extended 256K context. From ZenLM.',
    contextLength: 262144,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 18.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'qwen3-next',
    tag: '80b-a3b-instruct',
    name: 'Zen4 Max Pro',
    description:
      'Flagship Zen4 family MoE model. 80B parameters with 3B active for excellent reasoning, thinking, and tool calling with 256K context. From ZenLM.',
    contextLength: 262144,
    quality: OllamaModelQuality.Excellent,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 45.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'glm4.7-flash',
    tag: 'latest',
    name: 'Zen4 Coder Flash',
    description:
      'Fast Zen4 family coding model. Strong code generation, thinking, and tool calling with 128K context. From ZenLM.',
    contextLength: 131072,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 18.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'qwen3-coder-next',
    tag: 'latest',
    name: 'Zen4 Coder',
    description:
      'Premier Zen4 family coding model. Excellent code generation with deep reasoning, thinking, and tool calling with 256K context. From ZenLM.',
    contextLength: 262144,
    quality: OllamaModelQuality.Excellent,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 45.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  // Zen3 legacy models from huggingface.co/zenlm
  {
    model: 'qwen3',
    tag: '4b-thinking-2507',
    name: 'Zen3 Eco',
    description:
      'Zen3 legacy. Balanced AI for everyday tasks. Advanced reasoning with efficient performance. From ZenLM - open models for mindful AI use.',
    contextLength: 128000,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 2.5,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'hermes-4',
    tag: '70b',
    name: 'Zen3 Coder',
    description:
      'Zen3 legacy. Professional coding companion. Expert-level development with deep understanding. Built on ZenLM philosophy.',
    contextLength: 128000,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Average,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.ToolCalling,
    ],
    size: 40.0,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
  {
    model: 'qwen3',
    tag: '0.6b',
    name: 'Zen3 Nano',
    description:
      'Zen3 legacy. Ultra-lightweight clarity. Instant responses with minimal resources. From ZenLM - simplicity without compromise.',
    contextLength: 128000,
    quality: OllamaModelQuality.Low,
    speed: OllamaModelSpeed.VeryFast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
    ],
    size: 0.4,
    fullName: '',
    provider: 'ZenLM', // huggingface.co/zenlm
  },
];

export const OLLAMA_MODELS: OllamaModel[] = [
  ...PREINSTALLED_MODELS,
  ...(currentPlatform === 'windows' || currentPlatform === 'linux'
    ? [
        {
          model: 'gpt-oss',
          tag: '20b',
          name: 'gpt-oss',
          description:
            'OpenAI’s open-weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.',
          contextLength: 32000,
          quality: OllamaModelQuality.Good,
          speed: OllamaModelSpeed.Fast,
          capabilities: [
            OllamaModelCapability.TextGeneration,
            OllamaModelCapability.Thinking,
            OllamaModelCapability.ToolCalling,
          ],
          size: 7.5,
          fullName: '',
          provider: ModelProvider.OpenAI,
        },
        {
          model: 'llama3.1',
          tag: '8b-instruct-q4_1',
          name: 'Llama 3.1 8b',
          description:
            'A powerful AI model for understanding and generating text, optimized for tasks like writing and processing language',
          contextLength: 128000,
          quality: OllamaModelQuality.Medium,
          speed: OllamaModelSpeed.Fast,
          capabilities: [
          OllamaModelCapability.TextGeneration,
            OllamaModelCapability.ToolCalling,
          ],
          size: 4.7,
          fullName: '',
          provider: ModelProvider.Meta,
        },
      ]
    : []),
  ...(currentPlatform === 'macos'
    ? [
        {
          model: 'gpt-oss',
          tag: '20b',
          name: 'gpt-oss',
          description:
            'OpenAI’s open-weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.',
          contextLength: 128000,
          quality: OllamaModelQuality.Good,
          speed: OllamaModelSpeed.Fast,
          capabilities: [
            OllamaModelCapability.TextGeneration,
            OllamaModelCapability.Thinking,
            OllamaModelCapability.ToolCalling,
          ],
          size: 14,
          fullName: '',
          provider: ModelProvider.OpenAI,
          platforms: ['macos'],
        },
        {
          model: 'mistral-small3.2',
          tag: '24b-instruct-2506-q4_K_M',
          name: 'Mistral Small 3.2',
          description:
            'An update to Mistral Small that improves function calling, instruction following, and reduces repetition errors.',
          contextLength: 128000,
          quality: OllamaModelQuality.Medium,
          speed: OllamaModelSpeed.Fast,
          capabilities: [
            OllamaModelCapability.TextGeneration,
            OllamaModelCapability.ImageToText,
            OllamaModelCapability.ToolCalling,
          ],
          size: 15,
          fullName: '',
          provider: ModelProvider.Mistral,
          platforms: ['macos'],
        },
      ]
    : []),
  {
    model: 'qwen3',
    tag: '30b-a3b',
    name: 'Qwen 3 30B-A3B',
    description:
      'Qwen 3 30B-A3B is a mixture-of-experts (MoE) model with 30B total parameters and 3B active parameters. It features seamless switching between thinking and non-thinking modes, excelling at complex reasoning, math, coding, and general dialogue while being highly efficient.',
    contextLength: 128000,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Fast,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 15.6,
    fullName: '',
    provider: ModelProvider.Qwen,
    platforms: ['windows', 'linux', 'macos'],
  },
  {
    model: 'deepseek-r1',
    tag: '70b',
    name: 'DeepSeek R1 70B',
    description:
      'DeepSeek R1 70B is a powerful reasoning model achieving performance comparable to OpenAI-o1 across math, code, and reasoning tasks. It is derived from Llama3.3-70B-Instruct and optimized through distillation from larger models.',
    contextLength: 128000,
    quality: OllamaModelQuality.Good,
    speed: OllamaModelSpeed.Average,
    capabilities: [
      OllamaModelCapability.TextGeneration,
      OllamaModelCapability.Thinking,
      OllamaModelCapability.ToolCalling,
    ],
    size: 40.2,
    fullName: '',
    provider: ModelProvider.DeepSeek,
    platforms: ['windows', 'linux', 'macos'],
  },
].map((model) => {
  model.fullName = `${model.model}:${model.tag}` as const;
  return model;
});
