#!/bin/bash

# Download external binaries from GitHub releases
# This script downloads the required binaries for the Hanzo Desktop app
# instead of committing large executables to git

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/external-binaries"

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
mkdir -p "$BINARIES_DIR/ollama"

# Function to download and extract binary
download_binary() {
    local repo=$1
    local tag=$2
    local asset_name=$3
    local output_path=$4

    echo "Downloading $asset_name from $repo@$tag..."

    local url="https://github.com/$repo/releases/download/$tag/$asset_name"

    # Download with curl
    if ! curl -L -f -o "$output_path" "$url"; then
        echo "Failed to download $asset_name"
        echo "URL: $url"
        return 1
    fi

    chmod +x "$output_path"
    echo "Downloaded and made executable: $output_path"
}

# Download Hanzo Node (currently using hanzo-node releases until hanzoai/node has releases)
# The hanzo-node zip includes: hanzo-node, hanzo-tools-runner-resources/deno, hanzo-tools-runner-resources/uv
# TODO: Update to use hanzoai/node once releases are available
HANZO_NODE_TAG="v1.1.14"
HANZO_NODE_BINARY="hanzo-node-${TARGET}.zip"
if [ ! -f "$BINARIES_DIR/hanzo-node/hanzo-node-${TARGET}" ]; then
    if download_binary "dcSpark/hanzo-node" "$HANZO_NODE_TAG" "$HANZO_NODE_BINARY" \
        "$BINARIES_DIR/hanzo-node/hanzo-node.zip"; then
        unzip -o "$BINARIES_DIR/hanzo-node/hanzo-node.zip" -d "$BINARIES_DIR/hanzo-node/"

        # Rename hanzo-node to hanzo-node-<target>
        mv "$BINARIES_DIR/hanzo-node/hanzo-node" \
            "$BINARIES_DIR/hanzo-node/hanzo-node-${TARGET}"

        # Rename hanzo-tools-runner-resources to hanzo-tools-runner-resources
        if [ -d "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources" ]; then
            mv "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources" \
                "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources"
        fi

        # Rename the tools to include target suffix
        if [ -f "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno" ]; then
            mv "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno" \
                "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/deno-${TARGET}"
        fi

        if [ -f "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv" ]; then
            mv "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv" \
                "$BINARIES_DIR/hanzo-node/hanzo-tools-runner-resources/uv-${TARGET}"
        fi

        rm "$BINARIES_DIR/hanzo-node/hanzo-node.zip"
        echo "Downloaded Hanzo Node (hanzo-node) successfully with bundled tools"
    else
        echo "Warning: Could not download Hanzo Node binary"
    fi
fi

# Download Ollama
OLLAMA_TAG="v0.5.4"
# Ollama uses different naming: ollama-darwin (not ollama-apple-darwin)
if [[ "$PLATFORM" == "apple-darwin" ]]; then
    OLLAMA_BINARY="ollama-darwin"
elif [[ "$PLATFORM" == "unknown-linux-gnu" ]]; then
    OLLAMA_BINARY="ollama-linux-${ARCH_NAME}"
else
    OLLAMA_BINARY="ollama-windows-${ARCH_NAME}.exe"
fi

if [ ! -f "$BINARIES_DIR/ollama/ollama-${TARGET}" ]; then
    if download_binary "ollama/ollama" "$OLLAMA_TAG" "$OLLAMA_BINARY" \
        "$BINARIES_DIR/ollama/ollama-${TARGET}"; then
        echo "Downloaded Ollama successfully"
    fi
fi

echo "Binary download complete!"
echo "Binaries are located in: $BINARIES_DIR"
