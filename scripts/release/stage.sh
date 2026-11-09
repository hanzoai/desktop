#!/usr/bin/env bash
# Put one bundle where the release will find it, under the name the release gives it.
#
#   stage.sh '<glob>' <destination>
#
# The glob must match exactly one file. Tauri names a bundle for the product, with a
# space in it; the release names it Hanzo_Desktop_<version>_<arch>.<ext>, which is
# what hanzo.ai/download resolves. A bundle's updater signature, when it has one,
# travels with it.
set -euo pipefail

shopt -s nullglob
# shellcheck disable=SC2206
files=($1)
[ "${#files[@]}" -eq 1 ] || { echo "stage: '$1' matched ${#files[@]} files, want 1" >&2; exit 1; }
mkdir -p "$(dirname "$2")"
cp "${files[0]}" "$2"
[ ! -f "${files[0]}.sig" ] || cp "${files[0]}.sig" "$2.sig"
echo "staged $(basename "$2") ($(stat -c %s "$2") bytes)"
