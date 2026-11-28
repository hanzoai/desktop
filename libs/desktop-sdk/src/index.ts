export {
  getTitlebarInset,
  isMacOS,
  isTauriAvailable,
  safeInvoke,
  safeListen,
} from './runtime';

export {
  awaitCallback,
  EXPIRED_MESSAGE,
  finishAttempt,
  SignInCancelled,
  type Callback,
} from './oauth-loopback';

export {
  DEFAULT_LOCAL_ENGINE_URL,
  fetchEngineModels,
  fitsSystemRam,
  formatBytes,
  memoryNeededGb,
  probeEngineHealth,
  sendChatCompletion,
  type ChatMessage,
  type EngineHealth,
} from './local-engine';

export {
  WindowTitlebar,
  type WindowTitlebarProps,
} from './components/WindowTitlebar';

export {
  EngineStatusBadge,
  type EngineStatusBadgeProps,
} from './components/EngineStatusBadge';

export {
  getEndpointConfig,
  saveEndpointConfig,
  resetToLocalDefaults,
  probeEndpoints,
  isLoopbackUrl,
  LOCAL_CLOUD_URL,
  LOCAL_ENGINE_URL,
  PROD_CLOUD_URL,
  PROD_ENGINE_URL,
  type DesktopEndpointConfig,
} from './endpoint-manager';
