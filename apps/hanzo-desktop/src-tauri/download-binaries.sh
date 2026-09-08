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
EXT=""
[ "$PLATFORM" = "pc-windows-msvc" ] && EXT=".exe"
echo "Detected platform: $TARGET"

NODE_DIR="$BINARIES_DIR/hanzo-node"
mkdir -p "$NODE_DIR/hanzo-tools-runner-resources"
mkdir -p "$LLM_MODELS_DIR"

# Which release to fetch. One home, read here and named nowhere else.
. "$SCRIPT_DIR/pins"

# Download and extract Hanzo Node
echo "Downloading Hanzo Node ${HANZO_NODE_VERSION} for ${TARGET}..."
HANZO_NODE_URL="https://download.hanzo.ai/hanzo-node/binaries/production/${TARGET}/${HANZO_NODE_VERSION}.zip"

# Tauri resolves a sidecar by the name in tauri.conf.json plus the target
# triple, so each binary the archive carries is renamed once, here. The archive
# names them with the platform's own extension — hanzo-node.exe on Windows —
# and the suffix goes BEFORE it: hanzo-node-x86_64-pc-windows-msvc.exe.
SIDECARS="hanzo-node hanzo-tools-runner-resources/deno hanzo-tools-runner-resources/uv"

if [ ! -f "$NODE_DIR/hanzo-node-${TARGET}${EXT}" ]; then
    echo "Downloading from: $HANZO_NODE_URL"
    if curl -L -f -o "$NODE_DIR/hanzo-node.zip" "$HANZO_NODE_URL"; then
        unzip -o "$NODE_DIR/hanzo-node.zip" -d "$NODE_DIR/"

        for s in $SIDECARS; do
            src="$NODE_DIR/${s}${EXT}"
            dst="$NODE_DIR/${s}-${TARGET}${EXT}"
            [ -f "$src" ] || { echo "Archive is missing ${s}${EXT}"; exit 1; }
            mv "$src" "$dst"
            chmod +x "$dst"
        done

        rm "$NODE_DIR/hanzo-node.zip"
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
