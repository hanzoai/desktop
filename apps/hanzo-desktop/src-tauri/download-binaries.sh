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
mkdir -p "$LLM_MODELS_DIR"

# Hanzo Node version
HANZO_NODE_VERSION="v1.13.0"

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

# Ollama is NOT bundled as a sidecar. It is an optional, externally-managed
# engine (like LM Studio): the app connects to a user-run Ollama over HTTP.
# See the engine-agnostic local-AI design (OllamaEngine / LMStudioEngine).

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
