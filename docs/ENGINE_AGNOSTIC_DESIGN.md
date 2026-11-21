# Engine-Agnostic Local AI Architecture

## Problem Statement

The codebase is currently tightly coupled to Ollama for local AI model management. We need an abstraction layer to support multiple local AI engines:

1. **Hanzo Node** (preferred default) - Blockchain-integrated AI, enables mining rewards
2. **Ollama** - Popular open-source local LLM runner
3. **LM Studio** - User-friendly local LLM application

**Constraints:**
- Preserve existing Ollama functionality during migration
- Unified model discovery and installation UX across engines
- Engine-specific features must remain accessible (e.g., Hanzo mining rewards)
- No external dependencies beyond what engines already require

**Invariants:**
- One model can only belong to one engine at a time
- Engine availability is runtime-determined (process detection)
- Model installation is engine-specific but UI is unified

---

## Architecture Overview

```
                    +---------------------------+
                    |    LocalAIEngineManager   |
                    |  (singleton, React ctx)   |
                    +-------------+-------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
+--------v--------+    +----------v----------+    +--------v--------+
|  HanzoNodeEngine|    |    OllamaEngine     |    |  LMStudioEngine |
|  (preferred)    |    |    (current impl)   |    |                 |
+-----------------+    +---------------------+    +-----------------+
         |                        |                        |
         v                        v                        v
   [hanzo-node]              [ollama]                [lm-studio]
   (blockchain)              (HTTP API)              (HTTP API)
```

---

## Core Interfaces

### `/apps/hanzo-desktop/src/lib/local-ai/types.ts`

```typescript
/**
 * Unique identifier for supported local AI engines.
 */
export enum LocalAIEngineId {
  HanzoNode = 'hanzo-node',
  Ollama = 'ollama',
  LMStudio = 'lm-studio',
}

/**
 * Model capability flags.
 */
export enum ModelCapability {
  TextGeneration = 'text-generation',
  ImageToText = 'image-to-text',
  Thinking = 'thinking',
  ToolCalling = 'tool-calling',
  Embedding = 'embedding',
}

/**
 * Quality and speed tiers for UX display.
 */
export enum ModelQuality {
  Low = 'low',
  Medium = 'medium',
  Good = 'good',
}

export enum ModelSpeed {
  Average = 'average',
  Fast = 'fast',
  VeryFast = 'very-fast',
}

/**
 * Unified model representation across all engines.
 */
export interface LocalAIModel {
  /** Unique identifier: `${engineId}:${modelId}` */
  id: string;
  /** Engine-specific model identifier */
  modelId: string;
  /** Human-readable name */
  name: string;
  /** Model description */
  description: string;
  /** Which engine manages this model */
  engineId: LocalAIEngineId;
  /** Model capabilities */
  capabilities: ModelCapability[];
  /** Quality tier */
  quality: ModelQuality;
  /** Speed tier */
  speed: ModelSpeed;
  /** Size in GB */
  sizeGB: number;
  /** Context window length in tokens */
  contextLength: number;
  /** Provider/vendor name (e.g., "Meta", "OpenAI", "ZenLM") */
  provider?: string;
  /** Available tags/versions */
  tags?: ModelTag[];
  /** Currently selected tag */
  selectedTag?: string;
}

export interface ModelTag {
  name: string;
  size: string;
  hash?: string;
  isDefault?: boolean;
}

/**
 * Installation progress for a model.
 */
export interface ModelInstallProgress {
  modelId: string;
  engineId: LocalAIEngineId;
  status: 'pending' | 'downloading' | 'verifying' | 'success' | 'error';
  /** 0-100 */
  progress: number;
  /** Human-readable status message */
  message?: string;
  error?: string;
}

/**
 * Engine status and health.
 */
export interface EngineStatus {
  engineId: LocalAIEngineId;
  available: boolean;
  running: boolean;
  version?: string;
  apiUrl?: string;
  error?: string;
}

/**
 * Engine-specific benefits for UI display.
 */
export interface EngineBenefit {
  icon: string;
  title: string;
  description: string;
}

/**
 * Abstract interface for local AI engines.
 * Each engine implements this to provide unified model management.
 */
export interface LocalAIEngine {
  /** Engine identifier */
  readonly id: LocalAIEngineId;
  /** Human-readable engine name */
  readonly name: string;
  /** Engine description */
  readonly description: string;
  /** Benefits of using this engine (for UI) */
  readonly benefits: EngineBenefit[];
  /** Priority for default selection (lower = higher priority) */
  readonly priority: number;

  /**
   * Check if engine is available on this system.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get engine status and health info.
   */
  getStatus(): Promise<EngineStatus>;

  /**
   * Start the engine if not running.
   */
  start(): Promise<void>;

  /**
   * Stop the engine.
   */
  stop(): Promise<void>;

  /**
   * List installed models.
   */
  listInstalledModels(): Promise<LocalAIModel[]>;

  /**
   * List available models from repository.
   */
  listAvailableModels(): Promise<LocalAIModel[]>;

  /**
   * Install a model. Returns async generator for progress updates.
   */
  installModel(modelId: string, tag?: string): AsyncGenerator<ModelInstallProgress>;

  /**
   * Remove an installed model.
   */
  removeModel(modelId: string): Promise<void>;

  /**
   * Get model by ID.
   */
  getModel(modelId: string): Promise<LocalAIModel | null>;
}
```

---

## Engine Implementations

### `/apps/hanzo-desktop/src/lib/local-ai/engines/hanzo-node-engine.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';
import {
  LocalAIEngine,
  LocalAIEngineId,
  LocalAIModel,
  ModelInstallProgress,
  EngineStatus,
  EngineBenefit,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
} from '../types';

/**
 * Hanzo Node engine adapter.
 *
 * Benefits:
 * - Blockchain integration for AI coin mining
 * - Decentralized model verification
 * - Economic incentives for running inference
 */
export class HanzoNodeEngine implements LocalAIEngine {
  readonly id = LocalAIEngineId.HanzoNode;
  readonly name = 'Hanzo Node';
  readonly description = 'Blockchain-integrated AI with mining rewards';
  readonly priority = 0; // Highest priority (default)

  readonly benefits: EngineBenefit[] = [
    {
      icon: 'coins',
      title: 'Mining Rewards',
      description: 'Earn AI coins by running models and serving inference',
    },
    {
      icon: 'shield-check',
      title: 'Verified Models',
      description: 'Cryptographically verified model weights on-chain',
    },
    {
      icon: 'network',
      title: 'Network Effects',
      description: 'Contribute to decentralized AI infrastructure',
    },
  ];

  async isAvailable(): Promise<boolean> {
    try {
      return await invoke<boolean>('hanzo_node_is_available');
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const running = await invoke<boolean>('hanzo_node_is_running');
      const version = await invoke<string>('hanzo_node_get_version').catch(() => undefined);
      const apiUrl = await invoke<string>('hanzo_node_get_api_url').catch(() => undefined);

      return {
        engineId: this.id,
        available: true,
        running,
        version,
        apiUrl,
      };
    } catch (error) {
      return {
        engineId: this.id,
        available: false,
        running: false,
        error: String(error),
      };
    }
  }

  async start(): Promise<void> {
    await invoke('hanzo_node_spawn');
  }

  async stop(): Promise<void> {
    await invoke('hanzo_node_kill');
  }

  async listInstalledModels(): Promise<LocalAIModel[]> {
    const models = await invoke<HanzoNodeModel[]>('hanzo_node_list_models');
    return models.map((m) => this.toLocalAIModel(m));
  }

  async listAvailableModels(): Promise<LocalAIModel[]> {
    const models = await invoke<HanzoNodeModel[]>('hanzo_node_list_available_models');
    return models.map((m) => this.toLocalAIModel(m));
  }

  async *installModel(modelId: string, tag?: string): AsyncGenerator<ModelInstallProgress> {
    const fullId = tag ? `${modelId}:${tag}` : modelId;

    // Use Tauri events for progress streaming
    yield {
      modelId: fullId,
      engineId: this.id,
      status: 'pending',
      progress: 0,
      message: 'Starting installation...',
    };

    try {
      await invoke('hanzo_node_install_model', { model: fullId });
      yield {
        modelId: fullId,
        engineId: this.id,
        status: 'success',
        progress: 100,
        message: 'Installation complete',
      };
    } catch (error) {
      yield {
        modelId: fullId,
        engineId: this.id,
        status: 'error',
        progress: 0,
        error: String(error),
      };
    }
  }

  async removeModel(modelId: string): Promise<void> {
    await invoke('hanzo_node_remove_model', { model: modelId });
  }

  async getModel(modelId: string): Promise<LocalAIModel | null> {
    try {
      const model = await invoke<HanzoNodeModel | null>('hanzo_node_get_model', { model: modelId });
      return model ? this.toLocalAIModel(model) : null;
    } catch {
      return null;
    }
  }

  private toLocalAIModel(m: HanzoNodeModel): LocalAIModel {
    return {
      id: `${this.id}:${m.id}`,
      modelId: m.id,
      name: m.name,
      description: m.description,
      engineId: this.id,
      capabilities: m.capabilities as ModelCapability[],
      quality: m.quality as ModelQuality,
      speed: m.speed as ModelSpeed,
      sizeGB: m.size_gb,
      contextLength: m.context_length,
      provider: m.provider,
      tags: m.tags,
      selectedTag: m.selected_tag,
    };
  }
}

/** Internal type for Tauri IPC */
interface HanzoNodeModel {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  quality: string;
  speed: string;
  size_gb: number;
  context_length: number;
  provider?: string;
  tags?: { name: string; size: string; hash?: string; isDefault?: boolean }[];
  selected_tag?: string;
}
```

### `/apps/hanzo-desktop/src/lib/local-ai/engines/ollama-engine.ts`

```typescript
import { Ollama, type Config as OllamaConfig } from 'ollama/browser';
import {
  LocalAIEngine,
  LocalAIEngineId,
  LocalAIModel,
  ModelInstallProgress,
  EngineStatus,
  EngineBenefit,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
} from '../types';
import OLLAMA_MODELS_REPOSITORY from '../../hanzo-node-manager/ollama-models-repository.json';

/**
 * Ollama engine adapter.
 * Wraps existing Ollama integration behind the LocalAIEngine interface.
 */
export class OllamaEngine implements LocalAIEngine {
  readonly id = LocalAIEngineId.Ollama;
  readonly name = 'Ollama';
  readonly description = 'Popular open-source local LLM runner';
  readonly priority = 1;

  readonly benefits: EngineBenefit[] = [
    {
      icon: 'box',
      title: 'Simple Setup',
      description: 'One-command installation and model management',
    },
    {
      icon: 'library',
      title: 'Large Model Library',
      description: 'Access thousands of pre-quantized models',
    },
    {
      icon: 'terminal',
      title: 'CLI & API',
      description: 'Full command-line and REST API access',
    },
  ];

  private client: Ollama | null = null;
  private config: OllamaConfig;

  constructor(config?: OllamaConfig) {
    this.config = config ?? { host: 'http://127.0.0.1:11435' };
  }

  private getClient(): Ollama {
    if (!this.client) {
      this.client = new Ollama({
        ...this.config,
        fetch: this.removeForbiddenHeaders,
      });
    }
    return this.client;
  }

  private removeForbiddenHeaders = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    delete (init?.headers as Record<string, unknown>)?.['User-Agent'];
    return fetch(input, init);
  };

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.host}/api/version`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const response = await fetch(`${this.config.host}/api/version`);
      if (!response.ok) {
        return {
          engineId: this.id,
          available: false,
          running: false,
          error: `HTTP ${response.status}`,
        };
      }
      const data = await response.json();
      return {
        engineId: this.id,
        available: true,
        running: true,
        version: data.version,
        apiUrl: this.config.host,
      };
    } catch (error) {
      return {
        engineId: this.id,
        available: false,
        running: false,
        error: String(error),
      };
    }
  }

  async start(): Promise<void> {
    // Ollama is typically managed externally or via Hanzo Node
    // This is a no-op if Ollama is already running
    throw new Error('Ollama must be started externally or via Hanzo Node');
  }

  async stop(): Promise<void> {
    throw new Error('Ollama must be stopped externally or via Hanzo Node');
  }

  async listInstalledModels(): Promise<LocalAIModel[]> {
    const response = await this.getClient().list();
    return response.models.map((m) => this.installedModelToLocalAI(m));
  }

  async listAvailableModels(): Promise<LocalAIModel[]> {
    // Use static repository for available models
    return OLLAMA_MODELS_REPOSITORY
      .filter((m) => !m.embedding)
      .map((m) => this.repoModelToLocalAI(m));
  }

  async *installModel(modelId: string, tag?: string): AsyncGenerator<ModelInstallProgress> {
    const fullId = tag ? `${modelId}:${tag}` : modelId;

    yield {
      modelId: fullId,
      engineId: this.id,
      status: 'pending',
      progress: 0,
      message: 'Starting download...',
    };

    try {
      const stream = await this.getClient().pull({ model: fullId, stream: true });

      for await (const progress of stream) {
        const pct = progress.total
          ? Math.ceil((100 * (progress.completed ?? 0)) / progress.total)
          : 0;

        yield {
          modelId: fullId,
          engineId: this.id,
          status: progress.status === 'success' ? 'success' : 'downloading',
          progress: pct,
          message: progress.status,
        };
      }
    } catch (error) {
      yield {
        modelId: fullId,
        engineId: this.id,
        status: 'error',
        progress: 0,
        error: String(error),
      };
    }
  }

  async removeModel(modelId: string): Promise<void> {
    await this.getClient().delete({ model: modelId });
  }

  async getModel(modelId: string): Promise<LocalAIModel | null> {
    try {
      const response = await this.getClient().show({ model: modelId });
      return {
        id: `${this.id}:${modelId}`,
        modelId,
        name: modelId,
        description: response.modelfile ?? '',
        engineId: this.id,
        capabilities: [ModelCapability.TextGeneration],
        quality: ModelQuality.Medium,
        speed: ModelSpeed.Average,
        sizeGB: 0,
        contextLength: response.parameters?.num_ctx ?? 4096,
      };
    } catch {
      return null;
    }
  }

  private installedModelToLocalAI(m: { name: string; size?: number }): LocalAIModel {
    const repoModel = OLLAMA_MODELS_REPOSITORY.find(
      (r) => m.name.startsWith(r.name + ':') || m.name === r.name
    );

    return {
      id: `${this.id}:${m.name}`,
      modelId: m.name,
      name: repoModel?.name ?? m.name,
      description: repoModel?.description ?? '',
      engineId: this.id,
      capabilities: this.extractCapabilities(repoModel),
      quality: ModelQuality.Medium,
      speed: ModelSpeed.Average,
      sizeGB: m.size ? m.size / 1e9 : 0,
      contextLength: 4096,
      provider: repoModel?.name,
    };
  }

  private repoModelToLocalAI(m: OllamaRepoModel): LocalAIModel {
    return {
      id: `${this.id}:${m.name}`,
      modelId: m.name,
      name: m.name,
      description: m.description,
      engineId: this.id,
      capabilities: this.extractCapabilities(m),
      quality: ModelQuality.Medium,
      speed: ModelSpeed.Average,
      sizeGB: 0,
      contextLength: 4096,
      tags: m.tags?.map((t) => ({
        name: t.name,
        size: t.size,
        hash: t.hash,
        isDefault: t.isDefault,
      })),
      selectedTag: m.defaultTag,
    };
  }

  private extractCapabilities(m?: OllamaRepoModel | null): ModelCapability[] {
    const caps: ModelCapability[] = [ModelCapability.TextGeneration];
    if (m?.vision) caps.push(ModelCapability.ImageToText);
    if (m?.thinking) caps.push(ModelCapability.Thinking);
    if (m?.supportTools) caps.push(ModelCapability.ToolCalling);
    if (m?.embedding) caps.push(ModelCapability.Embedding);
    return caps;
  }
}

interface OllamaRepoModel {
  name: string;
  description: string;
  defaultTag?: string;
  tags?: { name: string; size: string; hash?: string; isDefault?: boolean }[];
  vision?: boolean;
  thinking?: boolean;
  supportTools?: boolean;
  embedding?: boolean;
  cloud?: boolean;
}
```

### `/apps/hanzo-desktop/src/lib/local-ai/engines/lm-studio-engine.ts`

```typescript
import {
  LocalAIEngine,
  LocalAIEngineId,
  LocalAIModel,
  ModelInstallProgress,
  EngineStatus,
  EngineBenefit,
  ModelCapability,
  ModelQuality,
  ModelSpeed,
} from '../types';

/**
 * LM Studio engine adapter.
 * Uses the LM Studio local server API.
 */
export class LMStudioEngine implements LocalAIEngine {
  readonly id = LocalAIEngineId.LMStudio;
  readonly name = 'LM Studio';
  readonly description = 'User-friendly local LLM application';
  readonly priority = 2;

  readonly benefits: EngineBenefit[] = [
    {
      icon: 'layout',
      title: 'Visual Interface',
      description: 'Browse and download models with a graphical UI',
    },
    {
      icon: 'sliders',
      title: 'Easy Configuration',
      description: 'Adjust parameters without command-line',
    },
    {
      icon: 'monitor',
      title: 'Cross-Platform',
      description: 'Native apps for Windows, macOS, and Linux',
    },
  ];

  private apiUrl: string;

  constructor(apiUrl: string = 'http://127.0.0.1:1234') {
    this.apiUrl = apiUrl;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/models`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/models`);
      if (!response.ok) {
        return {
          engineId: this.id,
          available: false,
          running: false,
          error: `HTTP ${response.status}`,
        };
      }
      return {
        engineId: this.id,
        available: true,
        running: true,
        apiUrl: this.apiUrl,
      };
    } catch (error) {
      return {
        engineId: this.id,
        available: false,
        running: false,
        error: String(error),
      };
    }
  }

  async start(): Promise<void> {
    throw new Error('LM Studio must be started manually via its desktop application');
  }

  async stop(): Promise<void> {
    throw new Error('LM Studio must be stopped manually via its desktop application');
  }

  async listInstalledModels(): Promise<LocalAIModel[]> {
    const response = await fetch(`${this.apiUrl}/v1/models`);
    if (!response.ok) {
      throw new Error(`Failed to list models: HTTP ${response.status}`);
    }
    const data: { data: LMStudioModel[] } = await response.json();
    return data.data.map((m) => this.toLocalAIModel(m));
  }

  async listAvailableModels(): Promise<LocalAIModel[]> {
    // LM Studio manages its own model repository via the desktop app
    // Return installed models as available; users install via LM Studio UI
    return this.listInstalledModels();
  }

  async *installModel(_modelId: string, _tag?: string): AsyncGenerator<ModelInstallProgress> {
    // LM Studio model installation happens through its desktop UI
    yield {
      modelId: _modelId,
      engineId: this.id,
      status: 'error',
      progress: 0,
      error: 'Models must be installed through LM Studio desktop application',
    };
  }

  async removeModel(_modelId: string): Promise<void> {
    throw new Error('Models must be removed through LM Studio desktop application');
  }

  async getModel(modelId: string): Promise<LocalAIModel | null> {
    const models = await this.listInstalledModels();
    return models.find((m) => m.modelId === modelId) ?? null;
  }

  private toLocalAIModel(m: LMStudioModel): LocalAIModel {
    return {
      id: `${this.id}:${m.id}`,
      modelId: m.id,
      name: m.id,
      description: `LM Studio model: ${m.id}`,
      engineId: this.id,
      capabilities: [ModelCapability.TextGeneration],
      quality: ModelQuality.Medium,
      speed: ModelSpeed.Average,
      sizeGB: 0,
      contextLength: 4096,
    };
  }
}

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}
```

---

## Engine Manager

### `/apps/hanzo-desktop/src/lib/local-ai/engine-manager.ts`

```typescript
import { LocalAIEngine, LocalAIEngineId, LocalAIModel, EngineStatus } from './types';
import { HanzoNodeEngine } from './engines/hanzo-node-engine';
import { OllamaEngine } from './engines/ollama-engine';
import { LMStudioEngine } from './engines/lm-studio-engine';

/**
 * Singleton manager for all local AI engines.
 * Provides unified access to model discovery and installation.
 */
export class LocalAIEngineManager {
  private static instance: LocalAIEngineManager | null = null;
  private engines: Map<LocalAIEngineId, LocalAIEngine> = new Map();

  private constructor() {
    // Register engines in priority order
    this.registerEngine(new HanzoNodeEngine());
    this.registerEngine(new OllamaEngine());
    this.registerEngine(new LMStudioEngine());
  }

  static getInstance(): LocalAIEngineManager {
    if (!LocalAIEngineManager.instance) {
      LocalAIEngineManager.instance = new LocalAIEngineManager();
    }
    return LocalAIEngineManager.instance;
  }

  registerEngine(engine: LocalAIEngine): void {
    this.engines.set(engine.id, engine);
  }

  getEngine(id: LocalAIEngineId): LocalAIEngine | undefined {
    return this.engines.get(id);
  }

  getAllEngines(): LocalAIEngine[] {
    return Array.from(this.engines.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get all engines that are currently available on this system.
   */
  async getAvailableEngines(): Promise<LocalAIEngine[]> {
    const engines = this.getAllEngines();
    const available: LocalAIEngine[] = [];

    for (const engine of engines) {
      if (await engine.isAvailable()) {
        available.push(engine);
      }
    }

    return available;
  }

  /**
   * Get the preferred default engine (first available by priority).
   */
  async getDefaultEngine(): Promise<LocalAIEngine | null> {
    const available = await this.getAvailableEngines();
    return available[0] ?? null;
  }

  /**
   * Get status of all engines.
   */
  async getAllEngineStatuses(): Promise<EngineStatus[]> {
    const engines = this.getAllEngines();
    return Promise.all(engines.map((e) => e.getStatus()));
  }

  /**
   * List all installed models across all available engines.
   */
  async listAllInstalledModels(): Promise<LocalAIModel[]> {
    const engines = await this.getAvailableEngines();
    const modelLists = await Promise.all(
      engines.map((e) => e.listInstalledModels().catch(() => []))
    );
    return modelLists.flat();
  }

  /**
   * List all available models across all available engines.
   */
  async listAllAvailableModels(): Promise<LocalAIModel[]> {
    const engines = await this.getAvailableEngines();
    const modelLists = await Promise.all(
      engines.map((e) => e.listAvailableModels().catch(() => []))
    );
    return modelLists.flat();
  }

  /**
   * Find a model by its composite ID.
   */
  async findModel(compositeId: string): Promise<LocalAIModel | null> {
    const [engineId, ...rest] = compositeId.split(':');
    const modelId = rest.join(':');
    const engine = this.engines.get(engineId as LocalAIEngineId);
    if (!engine) return null;
    return engine.getModel(modelId);
  }
}
```

---

## React Integration

### `/apps/hanzo-desktop/src/lib/local-ai/context.tsx`

```typescript
import React, { createContext, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LocalAIEngineManager } from './engine-manager';
import {
  LocalAIEngine,
  LocalAIEngineId,
  LocalAIModel,
  EngineStatus,
  ModelInstallProgress,
} from './types';

interface LocalAIContextValue {
  manager: LocalAIEngineManager;

  // Engine queries
  engines: LocalAIEngine[];
  engineStatuses: EngineStatus[];
  isLoadingStatuses: boolean;

  // Model queries
  installedModels: LocalAIModel[];
  availableModels: LocalAIModel[];
  isLoadingModels: boolean;

  // Actions
  installModel: (engineId: LocalAIEngineId, modelId: string, tag?: string) => Promise<void>;
  removeModel: (engineId: LocalAIEngineId, modelId: string) => Promise<void>;
  refreshModels: () => void;
}

const LocalAIContext = createContext<LocalAIContextValue | null>(null);

export function LocalAIProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const manager = useMemo(() => LocalAIEngineManager.getInstance(), []);
  const engines = useMemo(() => manager.getAllEngines(), [manager]);

  const { data: engineStatuses = [], isLoading: isLoadingStatuses } = useQuery({
    queryKey: ['local-ai', 'engine-statuses'],
    queryFn: () => manager.getAllEngineStatuses(),
    refetchInterval: 5000,
  });

  const { data: installedModels = [], isLoading: isLoadingInstalled } = useQuery({
    queryKey: ['local-ai', 'installed-models'],
    queryFn: () => manager.listAllInstalledModels(),
  });

  const { data: availableModels = [], isLoading: isLoadingAvailable } = useQuery({
    queryKey: ['local-ai', 'available-models'],
    queryFn: () => manager.listAllAvailableModels(),
  });

  const installMutation = useMutation({
    mutationFn: async ({
      engineId,
      modelId,
      tag,
    }: {
      engineId: LocalAIEngineId;
      modelId: string;
      tag?: string;
    }) => {
      const engine = manager.getEngine(engineId);
      if (!engine) throw new Error(`Engine ${engineId} not found`);

      for await (const progress of engine.installModel(modelId, tag)) {
        if (progress.status === 'error') {
          throw new Error(progress.error);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-ai', 'installed-models'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({
      engineId,
      modelId,
    }: {
      engineId: LocalAIEngineId;
      modelId: string;
    }) => {
      const engine = manager.getEngine(engineId);
      if (!engine) throw new Error(`Engine ${engineId} not found`);
      await engine.removeModel(modelId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-ai', 'installed-models'] });
    },
  });

  const value: LocalAIContextValue = {
    manager,
    engines,
    engineStatuses,
    isLoadingStatuses,
    installedModels,
    availableModels,
    isLoadingModels: isLoadingInstalled || isLoadingAvailable,
    installModel: (engineId, modelId, tag) =>
      installMutation.mutateAsync({ engineId, modelId, tag }),
    removeModel: (engineId, modelId) =>
      removeMutation.mutateAsync({ engineId, modelId }),
    refreshModels: () => {
      queryClient.invalidateQueries({ queryKey: ['local-ai'] });
    },
  };

  return (
    <LocalAIContext.Provider value={value}>
      {children}
    </LocalAIContext.Provider>
  );
}

export function useLocalAI(): LocalAIContextValue {
  const ctx = useContext(LocalAIContext);
  if (!ctx) {
    throw new Error('useLocalAI must be used within LocalAIProvider');
  }
  return ctx;
}
```

---

## UI Components

### `/apps/hanzo-desktop/src/components/local-ai/model-card.tsx`

```typescript
import { Badge, Button, Card, CardContent, CardFooter, CardHeader } from '@hanzo_network/hanzo-ui';
import { LocalAIModel, LocalAIEngineId } from '../../lib/local-ai/types';
import { useLocalAI } from '../../lib/local-ai/context';
import { EngineBadge } from './engine-badge';
import { ModelCapabilityTag } from '../hanzo-node-manager/components/model-capability-tag';

interface ModelCardProps {
  model: LocalAIModel;
  isInstalled: boolean;
}

export function ModelCard({ model, isInstalled }: ModelCardProps) {
  const { installModel, removeModel } = useLocalAI();

  const handleInstall = () => {
    installModel(model.engineId, model.modelId, model.selectedTag);
  };

  const handleRemove = () => {
    removeModel(model.engineId, model.modelId);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold">{model.name}</span>
          <EngineBadge engineId={model.engineId} />
        </div>
        <p className="text-sm text-muted-foreground">{model.description}</p>
      </CardHeader>

      <CardContent className="flex flex-wrap gap-1">
        {model.capabilities.map((cap) => (
          <ModelCapabilityTag key={cap} capability={cap} />
        ))}
        <Badge variant="outline">{model.sizeGB} GB</Badge>
      </CardContent>

      <CardFooter className="mt-auto">
        {isInstalled ? (
          <Button variant="destructive" onClick={handleRemove} className="w-full">
            Remove
          </Button>
        ) : (
          <Button onClick={handleInstall} className="w-full">
            Install
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
```

### `/apps/hanzo-desktop/src/components/local-ai/engine-badge.tsx`

```typescript
import { Badge } from '@hanzo_network/hanzo-ui';
import { Coins, Box, Monitor } from 'lucide-react';
import { LocalAIEngineId } from '../../lib/local-ai/types';

const engineConfig: Record<LocalAIEngineId, { label: string; icon: React.ElementType; className: string }> = {
  [LocalAIEngineId.HanzoNode]: {
    label: 'Hanzo Node',
    icon: Coins,
    className: 'bg-amber-900/50 text-amber-300 border-amber-700',
  },
  [LocalAIEngineId.Ollama]: {
    label: 'Ollama',
    icon: Box,
    className: 'bg-blue-900/50 text-blue-300 border-blue-700',
  },
  [LocalAIEngineId.LMStudio]: {
    label: 'LM Studio',
    icon: Monitor,
    className: 'bg-purple-900/50 text-purple-300 border-purple-700',
  },
};

export function EngineBadge({ engineId }: { engineId: LocalAIEngineId }) {
  const config = engineConfig[engineId];
  const Icon = config.icon;

  return (
    <Badge className={config.className} variant="outline">
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
```

### `/apps/hanzo-desktop/src/components/local-ai/engine-selector.tsx`

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hanzo_network/hanzo-ui';
import { useLocalAI } from '../../lib/local-ai/context';
import { LocalAIEngineId } from '../../lib/local-ai/types';
import { EngineBadge } from './engine-badge';

interface EngineSelectorProps {
  value: LocalAIEngineId | 'all';
  onChange: (value: LocalAIEngineId | 'all') => void;
}

export function EngineSelector({ value, onChange }: EngineSelectorProps) {
  const { engines, engineStatuses } = useLocalAI();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select engine" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Engines</SelectItem>
        {engines.map((engine) => {
          const status = engineStatuses.find((s) => s.engineId === engine.id);
          const isAvailable = status?.available ?? false;

          return (
            <SelectItem
              key={engine.id}
              value={engine.id}
              disabled={!isAvailable}
            >
              <div className="flex items-center gap-2">
                <EngineBadge engineId={engine.id} />
                {!isAvailable && <span className="text-xs text-muted-foreground">(unavailable)</span>}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
```

### `/apps/hanzo-desktop/src/components/local-ai/hanzo-node-benefits.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@hanzo_network/hanzo-ui';
import { Coins, ShieldCheck, Network } from 'lucide-react';

const benefits = [
  {
    icon: Coins,
    title: 'Earn Mining Rewards',
    description: 'Run AI models and earn tokens by contributing compute to the network.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified Models',
    description: 'All model weights are cryptographically verified on-chain.',
  },
  {
    icon: Network,
    title: 'Decentralized AI',
    description: 'Join the network of distributed AI infrastructure.',
  },
];

export function HanzoNodeBenefits() {
  return (
    <Card className="border-amber-700 bg-amber-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-300">
          <Coins className="h-5 w-5" />
          Why Hanzo Node?
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {benefits.map((benefit) => (
          <div key={benefit.title} className="flex items-start gap-3">
            <benefit.icon className="h-5 w-5 text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium text-amber-200">{benefit.title}</p>
              <p className="text-sm text-amber-300/70">{benefit.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

---

## Migration Plan

### Phase 1: Add Abstraction Layer (Non-breaking)

1. Create `/apps/hanzo-desktop/src/lib/local-ai/` with types and interfaces
2. Implement `OllamaEngine` wrapping existing code
3. Add `LocalAIEngineManager` singleton
4. Add `LocalAIProvider` context

### Phase 2: Implement Additional Engines

1. Implement `HanzoNodeEngine` with Tauri IPC
2. Implement `LMStudioEngine` with HTTP API
3. Add engine detection and status polling

### Phase 3: Update UI Components

1. Create new unified components in `/components/local-ai/`
2. Add engine badges and selectors
3. Add Hanzo Node benefits panel
4. Replace direct Ollama usage in existing components

### Phase 4: Deprecate Old Code

1. Mark old Ollama-specific components as deprecated
2. Update imports to use new abstraction
3. Remove deprecated code after validation

---

## File Structure Summary

```
apps/hanzo-desktop/src/
  lib/
    local-ai/
      types.ts              # Core interfaces
      engine-manager.ts     # Singleton manager
      context.tsx           # React context & hooks
      engines/
        hanzo-node-engine.ts
        ollama-engine.ts
        lm-studio-engine.ts
        index.ts
      index.ts
  components/
    local-ai/
      model-card.tsx
      model-list.tsx
      engine-badge.tsx
      engine-selector.tsx
      engine-status.tsx
      hanzo-node-benefits.tsx
      install-progress.tsx
      index.ts
```

---

## Rationale

1. **Interface-first design**: `LocalAIEngine` defines the contract; implementations are swappable.
2. **Singleton manager**: One source of truth for engine registration and discovery.
3. **Priority-based defaults**: Hanzo Node preferred when available; graceful fallback.
4. **Async generators for progress**: Native streaming without callbacks or observables.
5. **React Query integration**: Consistent caching, refetching, and invalidation.

**Trade-off chosen**: Static model repository for Ollama/Hanzo (vs. dynamic fetching). This keeps the implementation simple and offline-capable at the cost of requiring app updates for new models.
