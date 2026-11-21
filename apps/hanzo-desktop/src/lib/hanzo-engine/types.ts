/**
 * Hanzo Engine - Embedded AI Inference Types
 *
 * These types match the Rust backend types exposed via the HTTP API
 * on localhost:36900 (OpenAI-compatible format)
 */

// Model Format Detection
export enum ModelFormat {
  /** GGUF format (pre-quantized, single file) */
  Gguf = 'gguf',
  /** HuggingFace safetensors (with ISQ quantization) */
  Safetensors = 'safetensors',
  /** MLX-style prequantized models (from mlx-community) */
  MlxQuantized = 'mlx',
  /** UQFF (Universal Quantized File Format) */
  Uqff = 'uqff',
  /** Auto-detect format */
  Auto = 'auto',
}

/**
 * Detect model format from model ID or path
 * Mirrors the Rust implementation in types.rs
 */
export function detectModelFormat(modelId: string): ModelFormat {
  const lower = modelId.toLowerCase();

  // GGUF files
  if (lower.endsWith('.gguf') || lower.includes('/gguf/') || lower.includes('-gguf')) {
    return ModelFormat.Gguf;
  }

  // UQFF files
  if (lower.endsWith('.uqff') || lower.includes('uqff')) {
    return ModelFormat.Uqff;
  }

  // MLX community models
  if (lower.startsWith('mlx-community/') || lower.includes('-mlx') || lower.includes('/mlx-')) {
    return ModelFormat.MlxQuantized;
  }

  // Default to safetensors for HuggingFace repos
  if (lower.includes('/') && !lower.startsWith('/')) {
    return ModelFormat.Safetensors;
  }

  // Local paths - default to auto
  return ModelFormat.Auto;
}

// Engine Status
export interface EngineStatus {
  initialized: boolean;
  loaded_model: string | null;
  device: string;
  memory_usage: number | null;
  is_busy: boolean;
}

// Model Loading
export interface LoadModelOptions {
  model_id: string;
  /** Model format (auto-detected if not specified) */
  format?: ModelFormat;
  /** Quantization type (e.g., "Q4_K", "AFQ4", "Q8_0") */
  quantization?: string;
  /** Use in-situ quantization (ISQ) - quantize on load */
  use_isq?: boolean;
  /** Enable paged attention for long contexts */
  paged_attention?: boolean;
}

// Chat Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_per_sec?: number;
  completion_tokens_per_sec?: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage: UsageStats;
}

// Streaming
export interface StreamChunk {
  id: string;
  delta: string;
  finish_reason: string | null;
}

// OpenAI-compatible Model List
export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

// Error Response
export interface EngineError {
  error: string;
  message?: string;
}

// Engine Events (for streaming via Tauri events)
export enum EngineEvent {
  StreamChunk = 'engine-stream-chunk',
  StreamDone = 'engine-stream-done',
}

// Request Types for API
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingResponse {
  object: string;
  data: {
    object: string;
    embedding: number[];
    index: number;
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
