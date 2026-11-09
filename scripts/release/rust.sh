#!/usr/bin/env bash
# The Rust toolchain every release job builds with, and the one place its version is
# written. A runner image carries no Rust.
#
#   rust.sh [target]...
set -euo pipefail

version=1.99.1
export CARGO_HOME=${CARGO_HOME:-$HOME/.cargo} RUSTUP_HOME=${RUSTUP_HOME:-$HOME/.rustup}

if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
  curl --proto '=https' --tlsv1.2 -fsSL --retry 5 https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain none --no-modify-path
fi
targets=(); for t in "$@"; do targets+=(--target "$t"); done
"$CARGO_HOME/bin/rustup" toolchain install "$version" --profile minimal "${targets[@]}"
"$CARGO_HOME/bin/rustup" default "$version"
[ -z "${GITHUB_PATH:-}" ] || echo "$CARGO_HOME/bin" >> "$GITHUB_PATH"
