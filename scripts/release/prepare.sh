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

"$here/rust.sh" "$@"

cd "$root"
corepack enable
pnpm install --frozen-lockfile
