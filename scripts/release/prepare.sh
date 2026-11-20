#!/usr/bin/env bash
# What every desktop release job does before it builds: the Rust toolchain, the
# git dependencies cargo fetches, and the JavaScript workspace.
#
#   prepare.sh [rust-target]...
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)

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

"$here/rust.sh" "$@"

# src-tauri depends on git repositories GitHub serves only to an account that can see
# them (zap-proto/zapd, hanzoai/engine), and the job's own token cannot. The deploy token in KMS can.
# It goes to the one command that needs it, through git's environment, so the
# build scripts and install scripts that run after it never hold it. Cargo then
# finds the locked revisions already fetched.
. "$here/kms.sh"
token=$(kms_read deploy GITHUB_TOKEN)
echo "::add-mask::$token"
(cd "$root/apps/hanzo-desktop/src-tauri" \
  && CARGO_NET_GIT_FETCH_WITH_CLI=true GIT_CONFIG_COUNT=1 GIT_CONFIG_VALUE_0=https://github.com/ \
     GIT_CONFIG_KEY_0="url.https://x-access-token:$token@github.com/.insteadOf" \
     "${CARGO_HOME:-$HOME/.cargo}/bin/cargo" fetch)

cd "$root"
mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
[ -z "${GITHUB_PATH:-}" ] || echo "$HOME/.local/bin" >> "$GITHUB_PATH"
[ -z "${GITHUB_ENV:-}" ] || echo "COREPACK_ENABLE_DOWNLOAD_PROMPT=0" >> "$GITHUB_ENV"
if command -v corepack >/dev/null; then
  corepack enable --install-directory "$HOME/.local/bin"
elif ! command -v pnpm >/dev/null; then
  npm install -g --prefix "$HOME/.local" pnpm
fi
pnpm install --frozen-lockfile
