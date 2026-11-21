#!/bin/bash

# Downloads the binaries the Hanzo Desktop app bundles instead of committing them
# to git: the node from its hanzoai/node-v1 release (needs GH_TOKEN, pins), the
# embedding model from download.hanzo.ai.

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

NODE_DIR="$BINARIES_DIR/hanzo-node"
mkdir -p "$NODE_DIR/hanzo-tools-runner-resources"
mkdir -p "$LLM_MODELS_DIR"

# Which release to fetch. One home, read here and named nowhere else.
. "$SCRIPT_DIR/pins"

# Download and extract Hanzo Node
echo "Downloading Hanzo Node ${HANZO_NODE_VERSION} for ${TARGET}..."

# The archive's sha256 is pinned beside the version; an archive with no pin is
# refused.
WANT_VAR="HANZO_NODE_SHA256_${TARGET//-/_}"
WANT_SHA256="${!WANT_VAR:-}"
[ -n "$WANT_SHA256" ] || { echo "pins has no $WANT_VAR"; exit 1; }

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

github() {
    curl -fsSL --retry 5 --retry-all-errors -H "Authorization: Bearer $GH_TOKEN" "$@"
}

# Tauri resolves a sidecar by the name in tauri.conf.json plus the target
# triple, so each binary the archive carries is renamed once, here. The archive
# names them with the platform's own extension — hanzo-node.exe on Windows —
# and the suffix goes BEFORE it: hanzo-node-x86_64-pc-windows-msvc.exe.
SIDECARS="hanzo-node hanzo-tools-runner-resources/deno hanzo-tools-runner-resources/uv"

if [ ! -f "$NODE_DIR/hanzo-node-${TARGET}${EXT}" ]; then
    [ -n "${GH_TOKEN:-}" ] || { echo "GH_TOKEN must be a token that can read hanzoai/node-v1 (gh auth token)"; exit 1; }
    RELEASE_API="https://api.github.com/repos/hanzoai/node-v1/releases"
    ASSET_ID=$(github "$RELEASE_API/tags/$HANZO_NODE_VERSION" \
        | jq -r --arg n "hanzo-node-${TARGET}.zip" '.assets[] | select(.name == $n) | .id')
    [ -n "$ASSET_ID" ] || { echo "release $HANZO_NODE_VERSION has no hanzo-node-${TARGET}.zip"; exit 1; }
    if github -H "Accept: application/octet-stream" -o "$NODE_DIR/hanzo-node.zip" "$RELEASE_API/assets/$ASSET_ID"; then
        GOT_SHA256=$(sha256_of "$NODE_DIR/hanzo-node.zip")
        if [ "$GOT_SHA256" != "$WANT_SHA256" ]; then
            rm -f "$NODE_DIR/hanzo-node.zip"
            echo "hanzo-node-${TARGET}.zip is sha256 ${GOT_SHA256}, pins says ${WANT_SHA256}"
            exit 1
        fi
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
