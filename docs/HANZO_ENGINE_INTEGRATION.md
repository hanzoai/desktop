# Hanzo Engine Integration for Desktop

## Overview

This document analyzes hanzo-engine (at `/Users/z/work/hanzo/engine`) for embedding directly into hanzo-desktop, eliminating HTTP overhead for local inference.

---

## Current hanzo-engine Architecture

### Component Structure

```
hanzo-engine/
├── hanzo-engine/          # CLI wrapper (shell-out to mistralrs-server)
├── hanzo-engine-dso/      # DSO integration for experience retrieval (WIP)
├── mistralrs/             # High-level Rust async API
├── mistralrs-core/        # Core inference engine
├── mistralrs-server/      # HTTP server binary
├── mistralrs-server-core/ # HTTP server logic (axum routes)
├── mistralrs-pyo3/        # Python bindings
├── mistralrs-quant/       # Quantization implementations
├── mistralrs-paged-attn/  # PagedAttention
├── mistralrs-vision/      # Vision model support
├── mistralrs-audio/       # Audio processing
├── mistralrs-mcp/         # MCP server/client
└── mistralrs-bench/       # Benchmarking
```

### Key Facts

1. **Language**: Pure Rust with Candle ML framework
2. **Version**: 0.6.0 (synced with upstream mistral.rs at commit `530463af1`)
3. **Minimum Rust**: 1.86
4. **Backends**: Metal (macOS), CUDA (Linux/Windows), CPU (MKL, Accelerate, AVX/NEON)
5. **Model Formats**: HuggingFace safetensors, GGUF, GGML, GPTQ, AWQ, UQFF
6. **Quantization**: ISQ (Q2-Q8), GGUF (Q/K types), HQQ, FP8, AFQ (Metal-optimized), BNB

### Rust API Surface (`mistralrs` crate)

The `mistralrs` crate exposes async builders for direct embedding:

```rust
// Text model
TextModelBuilder::new("microsoft/Phi-3.5-mini-instruct")
    .with_isq(IsqType::Q8_0)
    .with_paged_attn(|| PagedAttentionMetaBuilder::default().build())?
    .build()
    .await?;

// GGUF model (quantized)
GgufModelBuilder::new(
    "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    vec!["Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"],
)
.with_tok_model_id("meta-llama/Meta-Llama-3.1-8B-Instruct")
.build()
.await?;
```

**Core types exposed:**
- `TextModelBuilder`, `GgufModelBuilder`, `VisionModelBuilder`
- `Model` - inference handle with `send_chat_request()`, `stream_chat_request()`, `generate_embeddings()`
- `TextMessages`, `VisionMessages` - message builders
- `SamplingParams`, `IsqType`, `PagedAttentionConfig`
- Full re-export of `mistralrs_core::*`

---

## Integration Options

### Option 1: Direct Rust Library Embedding (Recommended)

**Approach**: Add `mistralrs` as a Cargo dependency in the Tauri app's `src-tauri/Cargo.toml`.

**Pros:**
- Zero HTTP overhead (direct function calls)
- Streaming via async channels, not HTTP chunked encoding
- Shared memory for model weights
- Full control over lifecycle, resource allocation
- Type-safe API

**Cons:**
- Increases binary size (~50-100MB depending on features)
- Requires Rust 1.86+ (Tauri currently uses stable toolchain)
- Metal kernel compilation during build (can be slow, disable with `MISTRALRS_METAL_PRECOMPILE=0`)

**Implementation:**

```toml
# src-tauri/Cargo.toml
[dependencies]
mistralrs = { path = "../../hanzo/engine/mistralrs" }
mistralrs-core = { path = "../../hanzo/engine/mistralrs-core" }

[features]
default = ["metal"]
metal = ["mistralrs/metal", "mistralrs-core/metal"]
cuda = ["mistralrs/cuda", "mistralrs-core/cuda"]
```

```rust
// src-tauri/src/inference.rs
use mistralrs::{GgufModelBuilder, Model, TextMessages, TextMessageRole};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct InferenceEngine {
    model: Option<Arc<Model>>,
}

impl InferenceEngine {
    pub async fn load_gguf(&mut self, model_path: &str, files: Vec<String>) -> anyhow::Result<()> {
        let model = GgufModelBuilder::new(model_path, files)
            .with_logging()
            .build()
            .await?;
        self.model = Some(Arc::new(model));
        Ok(())
    }

    pub async fn chat(&self, messages: TextMessages) -> anyhow::Result<String> {
        let model = self.model.as_ref().ok_or(anyhow::anyhow!("No model loaded"))?;
        let response = model.send_chat_request(messages).await?;
        Ok(response.choices[0].message.content.clone().unwrap_or_default())
    }

    pub async fn stream_chat(&self, messages: TextMessages) -> anyhow::Result<impl futures::Stream<Item = String>> {
        let model = self.model.as_ref().ok_or(anyhow::anyhow!("No model loaded"))?;
        let stream = model.stream_chat_request(messages).await?;
        // Convert to string stream
        // ...
    }
}
```

### Option 2: Tauri Plugin (Recommended for Clean Separation)

**Approach**: Create a Tauri plugin that wraps mistralrs, exposing commands to the frontend.

**Structure:**
```
tauri-plugin-hanzo-engine/
├── Cargo.toml
├── src/
│   ├── lib.rs          # Plugin definition
│   ├── commands.rs     # Tauri commands
│   ├── state.rs        # Model state management
│   └── stream.rs       # Streaming support
└── permissions/
    └── default.toml
```

**Pros:**
- Clean plugin architecture
- Reusable across Tauri apps
- Permissions system for security
- Standard Tauri command/event patterns

### Option 3: CLI Shell-Out (Current hanzo-engine approach)

**Approach**: Shell out to the `mistralrs-server` or `hanzo-engine` binary.

**Pros:**
- Simplest to implement
- Process isolation
- Already how hanzo-engine works

**Cons:**
- HTTP overhead for every request
- Cold start latency (~5-10s model load per process)
- Process management complexity
- Memory duplication if running multiple models

**Not recommended for desktop embedding.**

### Option 4: WASM Compilation

**Status**: Not supported. The engine relies heavily on:
- System threading (`tokio`, `rayon`)
- GPU backends (Metal, CUDA)
- Memory-mapped files
- Native SIMD

WASM would require significant rearchitecting and would be CPU-only with degraded performance.

---

## GGUF Model Loading

GGUF is the recommended format for desktop deployment:

```rust
use mistralrs::{GgufModelBuilder, Model};

// Load local GGUF file
let model = GgufModelBuilder::new(
    "/path/to/local/model",           // directory or HF repo
    vec!["model.Q4_K_M.gguf"],        // GGUF file(s)
)
.with_tok_model_id("Qwen/Qwen3-8B")   // tokenizer source (optional)
.with_device_mapping(DeviceMapSetting::Auto(AutoDeviceMapParams::default_text()))
.build()
.await?;
```

**Supported GGUF architectures:**
- Llama, Phi2, Phi3, Starcoder2, Qwen2, Qwen3, Qwen3MoE

---

## Streaming Responses

```rust
use mistralrs::{Response, ChatCompletionChunkResponse, ChunkChoice, Delta};

let mut stream = model.stream_chat_request(messages).await?;

while let Some(chunk) = stream.next().await {
    match chunk {
        Response::Chunk(ChatCompletionChunkResponse { choices, .. }) => {
            if let Some(ChunkChoice { delta: Delta { content: Some(text), .. }, .. }) = choices.first() {
                // Emit to frontend via Tauri event
                app_handle.emit("inference-chunk", text)?;
            }
        }
        Response::Done(response) => {
            // Final response with usage stats
            app_handle.emit("inference-done", response)?;
        }
        Response::Error(e) => {
            app_handle.emit("inference-error", e.to_string())?;
        }
        _ => {}
    }
}
```

---

## Memory and GPU Requirements

### Model Memory (Approximate)

| Model Size | FP16 | Q8_0 | Q4_K_M |
|-----------|------|------|--------|
| 3B params | 6GB  | 3GB  | 1.8GB  |
| 7B params | 14GB | 7GB  | 4GB    |
| 8B params | 16GB | 8GB  | 4.5GB  |
| 13B params| 26GB | 13GB | 7GB    |

### PagedAttention KV Cache

For long context (128k tokens):
- FP16: ~16GB additional
- FP8 (f8e4m3): ~8GB additional

**Recommendation**: For desktop with 16GB unified memory (M1/M2/M3), use Q4_K_M with 4-8GB PagedAttention budget.

### Configuration Example

```rust
let model = GgufModelBuilder::new(model_id, files)
    .with_paged_attn(|| {
        PagedAttentionMetaBuilder::default()
            .with_gpu_memory(MemoryGpuConfig::Amount(4096))  // 4GB
            .with_block_size(32)
            .with_paged_cache_type(PagedCacheType::F8E4M3)   // FP8 for more context
            .build()
    })?
    .build()
    .await?;
```

---

## Recommended Integration Architecture

```
hanzo-desktop/
├── apps/hanzo-desktop/
│   └── src-tauri/
│       ├── Cargo.toml           # Add mistralrs dependencies
│       └── src/
│           ├── main.rs
│           ├── inference/
│           │   ├── mod.rs       # Inference module
│           │   ├── engine.rs    # InferenceEngine state
│           │   ├── commands.rs  # Tauri commands
│           │   └── events.rs    # Streaming events
│           └── commands/
│               └── inference_commands.rs
└── libs/
    └── hanzo-inference/         # Optional: shared inference types
```

### Tauri Commands

```rust
#[tauri::command]
async fn load_model(
    state: tauri::State<'_, Arc<RwLock<InferenceEngine>>>,
    model_path: String,
    files: Vec<String>,
) -> Result<(), String> {
    let mut engine = state.write().await;
    engine.load_gguf(&model_path, files).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat(
    state: tauri::State<'_, Arc<RwLock<InferenceEngine>>>,
    messages: Vec<Message>,
) -> Result<String, String> {
    let engine = state.read().await;
    engine.chat(messages.into()).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stream_chat(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<RwLock<InferenceEngine>>>,
    messages: Vec<Message>,
) -> Result<(), String> {
    let engine = state.read().await;
    let stream = engine.stream_chat(messages.into()).await.map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        while let Some(chunk) = stream.next().await {
            let _ = app.emit("inference-chunk", chunk);
        }
        let _ = app.emit("inference-done", ());
    });

    Ok(())
}
```

---

## API Surface to Expose

### Core Commands

| Command | Description |
|---------|-------------|
| `load_model` | Load GGUF/safetensors model from path |
| `unload_model` | Release model from memory |
| `list_models` | List available/loaded models |
| `chat` | Synchronous chat completion |
| `stream_chat` | Streaming chat completion |
| `generate_embeddings` | Text embeddings |
| `tokenize` | Tokenize text |
| `detokenize` | Detokenize tokens |
| `get_model_info` | Model metadata (context length, params, etc.) |

### Events

| Event | Payload |
|-------|---------|
| `inference-chunk` | `{ content: string }` |
| `inference-done` | `{ usage: UsageStats }` |
| `inference-error` | `{ error: string }` |
| `model-loaded` | `{ model_id: string }` |
| `model-unloaded` | `{ model_id: string }` |

---

## Build Considerations

### macOS (Metal)

```bash
# Enable Metal kernel precompilation (default, slower build)
cargo build --release --features metal

# Disable Metal precompilation (faster build, slower first inference)
MISTRALRS_METAL_PRECOMPILE=0 cargo build --release --features metal
```

### Linux (CUDA)

```bash
cargo build --release --features "cuda flash-attn cudnn"
```

### CPU Only

```bash
cargo build --release --features mkl  # Intel
cargo build --release --features accelerate  # macOS CPU
cargo build --release  # Generic (AVX/NEON auto-detected)
```

---

## Next Steps

1. **Add mistralrs dependency** to `apps/hanzo-desktop/src-tauri/Cargo.toml`
2. **Create inference module** with state management
3. **Implement Tauri commands** for model loading/inference
4. **Add streaming support** via Tauri events
5. **Create frontend hooks** in React for inference state
6. **Test with Qwen3 GGUF** models for initial validation

---

## References

- [mistral.rs Rust API Docs](https://ericlbuehler.github.io/mistral.rs/mistralrs/)
- [PagedAttention Paper](https://arxiv.org/abs/2309.06180)
- [GGUF Format Spec](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)
- [Candle ML Framework](https://github.com/huggingface/candle)
