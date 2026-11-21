#!/bin/bash

# Download external binaries from download.hanzo.ai (Cloudflare R2)
# This script downloads the required binaries for the Hanzo Desktop app
# instead of committing large executables to git

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/external-binaries"
LLM_MODELS_DIR="$SCRIPT_DIR/llm-models"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Darwin*)
        PLATFORM="apple-darwin"
        ;;
    Linux*)
        PLATFORM="unknown-linux-gnu"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        PLATFORM="pc-windows-msvc"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

case "$ARCH" in
    x86_64|amd64)
        ARCH_NAME="x86_64"
        ;;
    arm64|aarch64)
        ARCH_NAME="aarch64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# TARGET names the machine the bundle runs on, which is this one unless a
# cross build says otherwise: the release lane cuts the Windows installer on
# Linux and a universal macOS image from two slices, one call per slice.
TARGET="${TARGET:-${ARCH_NAME}-${PLATFORM}}"
EXT=""
case "$TARGET" in *-pc-windows-msvc) EXT=".exe" ;; esac
echo "Target: $TARGET"

mkdir -p "$LLM_MODELS_DIR"

# hanzo-node is not fetched: it left this app (HIP-1330). The one per-machine
# daemon, hanzod, is installed at ~/.hanzo/bin by the CLI.

# Ollama dropped per zoo/universe architecture: AI inference + embeddings
# go through the brand inference endpoint (cloud or hanzo-engine), not a
# bundled local LLM runner. Chain mining checkpoints go through native RPC.

# The hanzo-ml `soup` CLI is not fetched. Nothing has ever been published under
# hanzo-ml/ — the whole prefix answers 404 — so the fetch could only ever print
# a warning. src/model_tools/soup.rs finds the binary via HANZO_SOUP_BIN, or
# beside the app executable, or on PATH, and the Model Tools panel stays
# unavailable until one of those resolves.

# Download embedding model
EMBEDDING_MODEL="embeddinggemma-300M-BF16.gguf"
if [ ! -f "$LLM_MODELS_DIR/$EMBEDDING_MODEL" ]; then
    echo "Downloading embedding model..."
    EMBEDDING_URL="https://download.hanzo.ai/llm-models/${EMBEDDING_MODEL}"
    if curl -L -f --retry 5 --retry-all-errors -o "$LLM_MODELS_DIR/$EMBEDDING_MODEL" "$EMBEDDING_URL"; then
        echo "Downloaded embedding model successfully"
    else
        echo "Failed to download embedding model"
        exit 1
    fi
else
    echo "Embedding model already downloaded"
fi

echo ""
echo "Binary download complete!"
echo "Binaries are located in: $BINARIES_DIR"
echo "LLM models are located in: $LLM_MODELS_DIR"
