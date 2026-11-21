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

TARGET="${ARCH_NAME}-${PLATFORM}"
echo "Detected platform: $TARGET"

# Create directories
mkdir -p "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources"
mkdir -p "$BINARIES_DIR/hanzo-engine"
mkdir -p "$LLM_MODELS_DIR"

# Hanzo Node version
HANZO_NODE_VERSION="v1.13.0"

# Hanzo Engine version (inference engine; spawned as `mistralrs-server`).
# The desktop spawns this binary on :36900 (chat) / :36901 (embeddings). Path is
# overridable at runtime via HANZO_ENGINE_BIN.
HANZO_ENGINE_VERSION="v1.0.2"

# hanzo-ml `soup` CLI version — model soups (checkpoint averaging) + 1-bit
# BitDelta. Built from the hanzoai/ml `tensor-tools` crate. The desktop's Model
# Tools panel shells out to this binary; path is overridable via HANZO_SOUP_BIN.
HANZO_ML_VERSION="v0.9.2"

# Download and extract Hanzo Node from R2
echo "Downloading Hanzo Node ${HANZO_NODE_VERSION} for ${TARGET}..."
HANZO_NODE_URL="https://download.hanzo.ai/hanzo-node/binaries/production/${TARGET}/${HANZO_NODE_VERSION}.zip"

if [ ! -f "$BINARIES_DIR/hanzo-node/hanzo-node-${TARGET}" ]; then
    echo "Downloading from: $HANZO_NODE_URL"
    if curl -L -f -o "$BINARIES_DIR/hanzo-node/hanzo-node.zip" "$HANZO_NODE_URL"; then
        unzip -o "$BINARIES_DIR/hanzo-node/hanzo-node.zip" -d "$BINARIES_DIR/hanzo-node/"

        # Rename hanzo-node to hanzo-node-<target>
        if [ -f "$BINARIES_DIR/hanzo-node/hanzo-node" ]; then
            mv "$BINARIES_DIR/hanzo-node/hanzo-node" \
                "$BINARIES_DIR/hanzo-node/hanzo-node-${TARGET}"
            chmod +x "$BINARIES_DIR/hanzo-node/hanzo-node-${TARGET}"
        fi

        # Rename the tools to include target suffix
        if [ -f "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno" ]; then
            mv "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno" \
                "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno-${TARGET}"
            chmod +x "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno-${TARGET}"
        fi

        if [ -f "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv" ]; then
            mv "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv" \
                "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv-${TARGET}"
            chmod +x "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv-${TARGET}"
        fi

        rm "$BINARIES_DIR/hanzo-node/hanzo-node.zip"
        echo "Downloaded Hanzo Node successfully with bundled tools"
    else
        echo "Failed to download Hanzo Node binary"
        exit 1
    fi
else
    echo "Hanzo Node already downloaded"
fi

# Ollama dropped per zoo/universe architecture: AI inference + embeddings
# go through the brand inference endpoint (cloud or hanzo-engine), not a
# bundled local LLM runner. Chain mining checkpoints go through native RPC.

# Download the hanzo-ml `soup` CLI (model soups + BitDelta) from R2.
# Optional: the Model Tools panel degrades gracefully when it's absent (and the
# binary is also discoverable via PATH / HANZO_SOUP_BIN for dev builds), so a
# missing artifact is a warning, not a fatal error.
SOUP_BIN_NAME="soup"
if [[ "$PLATFORM" == "pc-windows-msvc" ]]; then
    SOUP_BIN_NAME="soup.exe"
fi
if [ ! -f "$BINARIES_DIR/hanzo-engine/soup-${TARGET}" ]; then
    echo "Downloading hanzo-ml soup CLI ${HANZO_ML_VERSION} for ${TARGET}..."
    SOUP_URL="https://download.hanzo.ai/hanzo-ml/binaries/production/${TARGET}/${HANZO_ML_VERSION}/${SOUP_BIN_NAME}"
    if curl -L -f -o "$BINARIES_DIR/hanzo-engine/soup-${TARGET}" "$SOUP_URL"; then
        chmod +x "$BINARIES_DIR/hanzo-engine/soup-${TARGET}"
        echo "Downloaded soup CLI successfully"
    else
        echo "WARNING: could not download soup CLI from ${SOUP_URL}."
        echo "         Model Tools (merge/compress) will be unavailable until you"
        echo "         build it (cargo build -p tensor-tools --bin soup) or set HANZO_SOUP_BIN."
        rm -f "$BINARIES_DIR/hanzo-engine/soup-${TARGET}"
    fi
else
    echo "soup CLI already downloaded"
fi

# Download embedding model from R2
EMBEDDING_MODEL="embeddinggemma-300M-BF16.gguf"
if [ ! -f "$LLM_MODELS_DIR/$EMBEDDING_MODEL" ]; then
    echo "Downloading embedding model..."
    EMBEDDING_URL="https://download.hanzo.ai/llm-models/${EMBEDDING_MODEL}"
    if curl -L -f -o "$LLM_MODELS_DIR/$EMBEDDING_MODEL" "$EMBEDDING_URL"; then
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
