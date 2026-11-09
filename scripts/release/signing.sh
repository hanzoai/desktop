#!/usr/bin/env bash
# The key the updater bundles are signed with, and the config their signatures are
# checked against.
#
#   signing.sh release|dry-run
#
# A release signs with the key in KMS (org hanzo, /desktop) and nothing else: if KMS
# does not hand it over, the job stops. A dry run asks KMS the same way, and when
# KMS refuses it signs with a key made for this run, so the signing and the check
# are exercised end to end without ever being able to ship. Exports
# TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD and UPDATER_CONF,
# the JSON file whose plugins.updater.pubkey the signatures must verify against.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
conf=$(cd "$here/../.." && pwd)/apps/hanzo-desktop/src-tauri/tauri.conf.json

if "$here/kms.sh" desktop TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD; then
  echo "UPDATER_CONF=$conf" >> "$GITHUB_ENV"
  echo "signing with the key in KMS /desktop"
  exit 0
fi
[ "$1" = dry-run ] || { echo "signing: a release is signed with the KMS key or not at all" >&2; exit 1; }

echo "::warning::KMS did not hand over the signing key; this dry run signs with a throwaway key"
tmp=${RUNNER_TEMP:-/tmp}/dry-run-key
mkdir -p "$tmp"
password=$(head -c 24 /dev/urandom | base64)
echo "::add-mask::$password"
(cd "$(cd "$here/../.." && pwd)" && pnpm exec tauri signer generate --ci -p "$password" -w "$tmp/key" >/dev/null)
echo "TAURI_SIGNING_PRIVATE_KEY=$(cat "$tmp/key")" >> "$GITHUB_ENV"
echo "TAURI_SIGNING_PRIVATE_KEY_PASSWORD=$password" >> "$GITHUB_ENV"
jq -nc --rawfile k "$tmp/key.pub" '{plugins: {updater: {pubkey: ($k | rtrimstr("\n"))}}}' > "$tmp/conf.json"
echo "UPDATER_CONF=$tmp/conf.json" >> "$GITHUB_ENV"
