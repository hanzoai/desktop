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

"$here/rust.sh" "$@"

# src-tauri depends on a git repository GitHub serves only to an account that can see
# it (zap-proto/zapd), and the job's own token cannot. The deploy token in KMS can.
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
corepack enable
pnpm install --frozen-lockfile
