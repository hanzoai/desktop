#!/usr/bin/env bash
set -euo pipefail

# The app looks for hanzod next to its own executable. Give Tauri the matching
# sidecar before it assembles and signs the app, DMG, and updater archive.
node_release=v1.19.5
download_url="https://github.com/hanzoai/node/releases/download/$node_release"

fail() {
  printf 'hanzod: %s\n' "$*" >&2
  exit 1
}

verify_binary() {
  local binary=$1
  shift
  [[ -f "$binary" && -x "$binary" ]] || fail "missing executable $binary"
  lipo "$binary" -verify_arch "$@" || fail "$binary must support $*"
}

download_binary() {
  local asset_arch=$1 rust_arch=$2 mac_arch=$3
  local archive="hanzod-darwin-$asset_arch.tar.gz" expected actual binary
  binary="$scratch/hanzod-$rust_arch-apple-darwin"

  curl -fsSL --retry 3 -o "$scratch/$archive" "$download_url/$archive"
  curl -fsSL --retry 3 -o "$scratch/$archive.sha256" "$download_url/$archive.sha256"
  read -r expected _ < "$scratch/$archive.sha256"
  actual=$(shasum -a 256 "$scratch/$archive")
  [[ "${actual%% *}" == "$expected" ]] || fail "SHA256 mismatch for $archive"

  tar -xOzf "$scratch/$archive" hanzod > "$binary"
  chmod 755 "$binary"
  verify_binary "$binary" "$mac_arch"
}

[[ "$#" -eq 3 ]] || fail 'usage: macos-hanzod.sh <stage|verify> <tauri-target> <src-tauri-directory|app-bundle>'
action=$1 target=$2 directory=$3
case "$target" in
  aarch64-apple-darwin) architectures=(arm64) ;;
  x86_64-apple-darwin) architectures=(x86_64) ;;
  universal-apple-darwin) architectures=(arm64 x86_64) ;;
  *) fail "unsupported target $target" ;;
esac

case "$action" in
  stage)
    scratch=$(mktemp -d)
    trap 'rm -rf "$scratch"' EXIT

    for architecture in "${architectures[@]}"; do
      case "$architecture" in
        arm64) download_binary arm64 aarch64 arm64 ;;
        x86_64) download_binary amd64 x86_64 x86_64 ;;
      esac
    done

    if [[ "$target" == universal-apple-darwin ]]; then
      # Cargo uses the two thin files; Tauri's universal bundler uses the fat file.
      universal="$scratch/hanzod-universal-apple-darwin"
      lipo -create "$scratch/hanzod-aarch64-apple-darwin" "$scratch/hanzod-x86_64-apple-darwin" -output "$universal"
      chmod 755 "$universal"
      verify_binary "$universal" "${architectures[@]}"
    fi

    config="$directory/tauri.macos.conf.json"
    jq '.bundle.externalBin |= ((. // []) | if index("binaries/hanzod") then . else . + ["binaries/hanzod"] end)' \
      "$config" > "$scratch/tauri.macos.conf.json"
    mkdir -p "$directory/binaries"
    install -m 755 "$scratch"/hanzod-*-apple-darwin "$directory/binaries/"
    cat "$scratch/tauri.macos.conf.json" > "$config"
    ;;
  verify)
    verify_binary "$directory/Contents/MacOS/hanzod" "${architectures[@]}"
    ;;
  *) fail "unsupported action $action" ;;
esac
