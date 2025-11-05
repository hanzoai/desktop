# Embedding Models Configuration - Hanzo Desktop

## Critical Finding: DigitalOcean Free Tier Does NOT Support Embeddings

### Summary
DigitalOcean's `inference.do-ai.run` API provides **21 free chat models** but **NO embedding models**. The embeddings endpoint returns `401 Unauthorized: route not allowed`.

### Available Models by Provider

#### ✅ DigitalOcean Free Tier (Chat Only)
**Endpoint**: `https://inference.do-ai.run`
**API Key**: `sk-do-xwKWq7K46YEhZ_9Qp2NECnqv3Idi048LU93fLXMdgeEHjRGkdmKK-ydh1j`

**21 Chat Models Available**:
```
alibaba-qwen3-32b (best value)
llama3.3-70b-instruct (high quality)
llama3-8b-instruct (fast, cheap)
deepseek-r1-distill-llama-70b
mistral-nemo-instruct-2407
openai-gpt-4.1, gpt-4o, gpt-4o-mini
openai-gpt-5, gpt-5-mini, gpt-5-nano
openai-gpt-oss-120b, gpt-oss-20b
openai-o1, o3, o3-mini
anthropic-claude-3-opus
anthropic-claude-3.5-haiku
anthropic-claude-3.7-sonnet
anthropic-claude-opus-4
anthropic-claude-sonnet-4
```

**❌ NO Embedding Models** - Must use local Ollama

#### ✅ Local Ollama (Embeddings Only)
**Default**: `snowflake-arctic-embed:xs` (110MB)

**Supported Models**:
```
snowflake-arctic-embed:xs (110MB) - Default, bundled
qwen3-embedding:0.6b (639MB) - Lightweight Qwen3
qwen3-embedding:4b (2.5GB) - Balanced Qwen3
qwen3-embedding:8b (4.7GB) - Best quality Qwen3
embeddinggemma:300m (622MB) - Google embedding model
nomic-embed-text:v1.5 (274MB) - Large context window
mxbai-embed-large:335m (670MB) - State-of-the-art
```

### Current Configuration

**In `hanzo_node_options.rs`**:
```rust
default_embedding_model: "snowflake-arctic-embed:xs"
supported_embedding_models: "snowflake-arctic-embed:xs,qwen3-embedding:0.6b,qwen3-embedding:4b,qwen3-embedding:8b,embeddinggemma:300m,nomic-embed-text:v1.5,mxbai-embed-large:335m"
```

**Default Agents** (pointing to `gateway.hanzo.ai`):
```rust
initial_agent_urls: "https://gateway.hanzo.ai,https://gateway.hanzo.ai"
initial_agent_names: "hanzo_free_trial,hanzo_code_gen"
initial_agent_models: "hanzo-backend:FREE_TEXT_INFERENCE,hanzo-backend:CODE_GENERATOR"
initial_agent_api_keys: "'',''"  // Empty for free tier
```

### Gateway Setup

**Location**: `~/work/hanzo/gateway`
**Status**: ✅ Running on `http://localhost:3001`

**Endpoints**:
- `GET /health` - Health check
- `GET /v1/models` - List 21 available models
- `POST /v1/chat/completions` - Chat inference (proxies to DO)
- `POST /v1/embeddings` - ✅ Embeddings (proxies to local Ollama)

**Configuration** (`.env`):
```bash
DIGITALOCEAN_API_KEY=sk-do-xwKWq7K46YEhZ_9Qp2NECnqv3Idi048LU93fLXMdgeEHjRGkdmKK-ydh1j
INFERENCE_PORT=3001
FREE_TIER_REQUESTS_PER_MINUTE=10
FREE_TIER_REQUESTS_PER_HOUR=100
FREE_TIER_REQUESTS_PER_DAY=500
FREE_TIER_TOKENS_PER_DAY=50000
```

### Architecture

```
┌─────────────────┐
│  Hanzo Desktop  │
└────────┬────────┘
         │
         ├─── Chat Inference ──────────> gateway.hanzo.ai ──> inference.do-ai.run (21 models)
         │
         └─── Embeddings ──────────────> localhost:11435 (Ollama)
                                          └─> snowflake-arctic-embed:xs (default)
```

### Key Takeaways

1. **Chat Models**: Use DigitalOcean free tier via `gateway.hanzo.ai`
   - 21 models including GPT-5, Claude Opus 4, Qwen3-32B
   - No API key required for free tier (IP-based rate limiting)

2. **Embedding Models**: Use local Ollama ONLY
   - Default: `snowflake-arctic-embed:xs` (works out-of-box)
   - Users can download additional models from UI
   - DigitalOcean does NOT support embeddings endpoint

3. **hanzo-node Startup**: Now gracefully handles missing embedding GGUF
   - Won't crash if embedding model file missing
   - Users guided to download via onboarding flow

### Embedding Model Mappings

The gateway maps DigitalOcean embedding model names to local Ollama equivalents:

| DO Model (GradientAI) | Ollama Model | Dimensions | Size |
|---|---|---|---|
| sentence-transformers/all-MiniLM-L6-v2 | snowflake-arctic-embed:xs | 384 | 110MB |
| sentence-transformers/multi-qa-mpnet-base-dot-v1 | qwen3-embedding:0.6b | 1024 | 639MB |
| Alibaba-NLP/gte-large-en-v1.5 | nomic-embed-text:v1.5 | 768 | 274MB |

### Testing Embeddings

```bash
# ✅ Test with DO model names (gateway proxies to Ollama)
curl -X POST http://localhost:3001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "sentence-transformers/all-MiniLM-L6-v2", "input": "test"}'

curl -X POST http://localhost:3001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "sentence-transformers/multi-qa-mpnet-base-dot-v1", "input": "test"}'

curl -X POST http://localhost:3001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "Alibaba-NLP/gte-large-en-v1.5", "input": "test"}'

# ❌ Direct DO embeddings not available via API
# DO embeddings are for agent knowledge bases only (OpenSearch storage)
curl https://inference.do-ai.run/v1/embeddings \
  -H "Authorization: Bearer sk-do-..." \
  -d '{"input": "test", "model": "text-embedding-ada-002"}'
# Returns: {"error": {"message": "route not allowed", "type": "unauthorized_error"}}
```

### Recommendations

1. **Keep snowflake-arctic-embed:xs as default** - it's small, fast, and works immediately
2. **Promote qwen3-embedding:0.6b** - best qwen3 option at only 639MB
3. **Document the limitation** - users need to understand DO = chat only, Ollama = embeddings only
4. **Future**: Consider adding OpenAI embeddings as paid tier option

---

**Last Updated**: 2025-11-05
**Gateway Status**: Running at http://localhost:3001
**DO API Key**: Confirmed working with 21 models
