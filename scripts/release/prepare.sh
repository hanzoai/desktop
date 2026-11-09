#!/usr/bin/env bash
# What every desktop release job does before it builds: the sibling crates cargo
# needs to resolve, the Rust toolchain, and the JavaScript workspace.
#
#   prepare.sh [rust-target]...
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)

# src-tauri/Cargo.toml names hanzoai/engine by path, behind the `native-engine`
# feature that no release enables. Cargo still reads those manifests to resolve the
# graph, so each needs to exist beside this checkout; nothing compiles them. A
# manifest with the features src-tauri forwards, and an empty lib, is all it reads.
engine=$(dirname "$root")/engine
for crate in hanzo hanzo-engine hanzo-server-core; do
  mkdir -p "$engine/$crate/src"
  printf '[workspace]\n\n[package]\nname = "%s"\nversion = "0.1.0"\nedition = "2021"\n\n[features]\nmetal = []\ncuda = []\nvulkan = []\naccelerate = []\nflash-attn = []\n' \
    "$crate" > "$engine/$crate/Cargo.toml"
  : > "$engine/$crate/src/lib.rs"
done

# The cluster image carries Node. A bare host, the Mac, does not.
if ! command -v node >/dev/null; then
  node=22.23.3
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case $(uname -m) in x86_64) cpu=x64 ;; *) cpu=arm64 ;; esac
  tar=node-v$node-$os-$cpu.tar.gz
  home=${RUNNER_TEMP:-/tmp}/node
  mkdir -p "$home"
  curl -fsSL --retry 5 -o "$home/$tar" "https://nodejs.org/dist/v$node/$tar"
  (cd "$home" && curl -fsSL "https://nodejs.org/dist/v$node/SHASUMS256.txt" | grep " $tar\$" | shasum -a 256 -c -)
  tar -xzf "$home/$tar" -C "$home" --strip-components=1
  export PATH=$home/bin:$PATH
  [ -z "${GITHUB_PATH:-}" ] || echo "$home/bin" >> "$GITHUB_PATH"
fi

# Cargo fetches the git dependencies (zapd, fix-path-env) anonymously through
# libgit2, and every runner shares a handful of egress addresses: GitHub answers an
# anonymous clone from them with a refusal libgit2 reports as "failed to
# authenticate". The git CLI with the job's own token is neither refused nor
# able to leave the token behind: git reads it from the environment, which ends
# with the job, and not from a gitconfig on a host that outlives it.
if [ -n "${GITHUB_ENV:-}" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
  {
    echo "CARGO_NET_GIT_FETCH_WITH_CLI=true"
    echo "GIT_CONFIG_COUNT=1"
    echo "GIT_CONFIG_KEY_0=url.https://x-access-token:$GITHUB_TOKEN@github.com/.insteadOf"
    echo "GIT_CONFIG_VALUE_0=https://github.com/"
  } >> "$GITHUB_ENV"
  export CARGO_NET_GIT_FETCH_WITH_CLI=true GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0="url.https://x-access-token:$GITHUB_TOKEN@github.com/.insteadOf" \
    GIT_CONFIG_VALUE_0=https://github.com/
fi

"$here/rust.sh" "$@"

cd "$root"
corepack enable
pnpm install --frozen-lockfile
