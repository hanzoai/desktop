/**
 * Sidecar Engine - App-managed external process.
 *
 * Sidecar engines run as separate processes that the app can start/stop.
 * Examples: Ollama, Hanzo Node
 *
 * Key difference from regular Engine:
 * - App controls process lifecycle (start/stop)
 * - Process health monitoring
 * - Model management (pull/remove)
 */

import type { Engine, Model, Result } from '../types';

/**
 * Sidecar Engine interface.
 *
 * Extends Engine with process lifecycle and model management.
 */
export interface SidecarEngine extends Engine {
  /**
   * Start the sidecar process.
   */
  start(): Promise<Result<void>>;

  /**
   * Stop the sidecar process.
   */
  stop(): Promise<Result<void>>;

  /**
   * Check if the sidecar process is running.
   */
  isRunning(): Promise<boolean>;

  /**
   * Restart the sidecar process.
   */
  restart(): Promise<Result<void>>;

  /**
   * Get process health status.
   */
  getHealth(): Promise<SidecarHealth>;
}

/**
 * Model Manager interface.
 *
 * For sidecars that can download and manage models locally.
 */
export interface ModelManager {
  /**
   * Pull/download a model.
   * Yields progress updates during download.
   */
  pullModel(name: string): AsyncGenerator<PullProgress, Result<InstalledModel>, unknown>;

  /**
   * Remove an installed model.
   */
  removeModel(name: string): Promise<Result<void>>;

  /**
   * Get installed models.
   */
  getInstalledModels(): Promise<Result<InstalledModel[]>>;

  /**
   * Check if a model is installed.
   */
  isModelInstalled(name: string): Promise<boolean>;
}

/**
 * Sidecar health status.
 */
export interface SidecarHealth {
  /** Whether process is running */
  readonly running: boolean;
  /** Process uptime in seconds */
  readonly uptimeSeconds?: number;
  /** Memory usage in bytes */
  readonly memoryBytes?: number;
  /** CPU usage percentage */
  readonly cpuPercent?: number;
  /** Version string */
  readonly version?: string;
  /** Error if unhealthy */
  readonly error?: string;
}

/**
 * Model pull progress.
 */
export interface PullProgress {
  readonly modelId: string;
  readonly status: string;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly percent: number;
  readonly etaSeconds?: number;
}

/**
 * Model capability flags.
 */
export enum ModelCapability {
  TextGeneration = 'text-generation',
  Vision = 'vision',
  Thinking = 'thinking',
  ToolCalling = 'tool-calling',
  Embedding = 'embedding',
  Code = 'code',
}

/**
 * Model quality tier.
 */
export enum ModelQuality {
  Low = 'low',
  Medium = 'medium',
  Good = 'good',
  Excellent = 'excellent',
}

/**
 * Model speed tier.
 */
export enum ModelSpeed {
  Slow = 'slow',
  Average = 'average',
  Fast = 'fast',
  VeryFast = 'very-fast',
}

/**
 * Model status.
 */
export enum ModelStatus {
  Available = 'available',
  Installing = 'installing',
  Installed = 'installed',
  Running = 'running',
  Failed = 'failed',
}

/**
 * Installed model with metadata.
 */
export interface InstalledModel extends Model {
  readonly tag: string;
  readonly sizeBytes: number;
  readonly contextLength: number;
  readonly capabilities: ModelCapability[];
  readonly quality: ModelQuality;
  readonly speed: ModelSpeed;
  readonly status: ModelStatus;
  readonly provider?: string;
  readonly parameters?: string;
  readonly quantization?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Query keys for sidecar state.
 */
export const SidecarQueryKeys = {
  all: ['sidecar'] as const,
  health: (id: string) => [...SidecarQueryKeys.all, id, 'health'] as const,
  models: (id: string) => [...SidecarQueryKeys.all, id, 'models'] as const,
  pulling: () => [...SidecarQueryKeys.all, 'pulling'] as const,
} as const;
