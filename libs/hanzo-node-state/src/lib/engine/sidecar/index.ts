/**
 * Sidecar Engines - App-managed external processes.
 *
 * Sidecars are separate processes managed by the application:
 * - Ollama: Local LLM runner with model management
 * - Hanzo Node: Blockchain-integrated AI with mining rewards
 *
 * Both provide:
 * - OpenAI-compatible chat/completion API
 * - Model management (pull/remove/list)
 * - Health monitoring
 */

// Types
export type {
  InstalledModel,
  ModelManager,
  PullProgress,
  SidecarEngine,
  SidecarHealth,
} from './types';

export {
  ModelCapability,
  ModelQuality,
  ModelSpeed,
  ModelStatus,
  SidecarQueryKeys,
} from './types';

// Ollama
export { createOllama, OllamaSidecar } from './ollama';
export type { OllamaConfig } from './ollama';

// Hanzo Node
export {
  createHanzoNode,
  HANZO_NODE_BENEFITS,
  HanzoNodeSidecar,
} from './hanzo-node';
export type { HanzoModelMetadata, HanzoNodeConfig } from './hanzo-node';
