export enum HanzoNodeManagerEvent {
  StartingHanzoNode = 'StartingHanzoNode',
  HanzoNodeStarted = 'HanzoNodeStarted',
  HanzoNodeStartError = 'HanzoNodeStartError',

  StartingOllama = 'StartingOllama',
  OllamaStarted = 'OllamaStarted',
  OllamaStartError = 'OllamaStartError',

  PullingModelStart = 'PullingModelStart',
  PullingModelProgress = 'PullingModelProgress',
  PullingModelDone = 'PullingModelDone',
  PullingModelError = 'PullingModelError',

  StoppingHanzoNode = 'StoppingHanzoNode',
  HanzoNodeStopped = 'HanzoNodeStopped',
  HanzoNodeStopError = 'HanzoNodeStopError',

  StoppingOllama = 'StoppingOllama',
  OllamaStopped = 'OllamaStopped',
  OllamaStopError = 'OllamaStopError',
}

export interface HanzoNodeStartErrorEvent {
  error: string;
}
export interface OllamaStartErrorEvent {
  error: string;
}

export interface PullingModelStartEvent {
  model: string;
}
export interface PullingModelProgressEvent {
  model: string;
  progress: number;
}
export interface PullingModelDoneEvent {
  model: string;
}
export interface PullingModelErrorEvent {
  model: string;
  error: string;
}

export interface HanzoNodeStopErrorEvent {
  error: string;
}
export interface OllamaStopErrorEvent {
  error: string;
}

export type HanzoNodeManagerEventMap =
  | { type: HanzoNodeManagerEvent.StartingHanzoNode; payload: never }
  | { type: HanzoNodeManagerEvent.HanzoNodeStarted; payload: never }
  | {
      type: HanzoNodeManagerEvent.HanzoNodeStartError;
      payload: HanzoNodeStartErrorEvent;
    }
  | { type: HanzoNodeManagerEvent.StartingOllama; payload: never }
  | { type: HanzoNodeManagerEvent.OllamaStarted; payload: never }
  | {
      type: HanzoNodeManagerEvent.OllamaStartError;
      payload: OllamaStartErrorEvent;
    }
  | {
      type: HanzoNodeManagerEvent.PullingModelStart;
      payload: PullingModelStartEvent;
    }
  | {
      type: HanzoNodeManagerEvent.PullingModelProgress;
      payload: PullingModelProgressEvent;
    }
  | {
      type: HanzoNodeManagerEvent.PullingModelDone;
      payload: PullingModelDoneEvent;
    }
  | {
      type: HanzoNodeManagerEvent.PullingModelError;
      payload: PullingModelErrorEvent;
    }
  | { type: HanzoNodeManagerEvent.StoppingHanzoNode; payload: never }
  | { type: HanzoNodeManagerEvent.HanzoNodeStopped; payload: never }
  | {
      type: HanzoNodeManagerEvent.HanzoNodeStopError;
      payload: HanzoNodeStopErrorEvent;
    }
  | { type: HanzoNodeManagerEvent.StoppingOllama; payload: never }
  | { type: HanzoNodeManagerEvent.OllamaStopped; payload: never }
  | {
      type: HanzoNodeManagerEvent.OllamaStopError;
      payload: OllamaStopErrorEvent;
    };

export type HanzoNodeOptions = {
   node_api_ip?: string,
   node_api_port?: string,
   node_ws_port?: string,
   node_ip?: string,
   node_port?: string,
   global_identity_name?: string,
   node_storage_path?: string,
   embeddings_server_url?: string,
   first_device_needs_registration_code?: string,
   initial_agent_names?: string,
   initial_agent_urls?: string,
   initial_agent_models?: string,
   initial_agent_api_keys?: string,
   starting_num_qr_devices?: string,
   log_all?: string,
   proxy_identity?: string,
   rpc_url?: string,
   default_embedding_model?: string,
   supported_embedding_models?: string,
   hanzo_tools_runner_deno_binary_path?: string,
   hanzo_tools_runner_uv_binary_path?: string,
   hanzo_store_url?: string,
   secret_desktop_installation_proof_key?: string,
};

export type LogEntry = {
  timestamp: number;
  process: string;
  message: string;
};
