#!/bin/bash
# Build and install Hanzo.app on this Mac, signed with this Mac's stable Apple Development
# identity (hardened runtime, src-tauri/entitlements.plist) instead of ad hoc. A rebuilt app
# keeps one designated requirement, so macOS grants (microphone, "Always Allow") survive it.
#
#   scripts/local-build.sh            build, then replace /Applications/Hanzo.app (the old copy is kept aside)
#   scripts/local-build.sh --no-install
#
# CI signs with its own identity through APPLE_SIGNING_IDENTITY; this only supplies one when unset.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -p codesigning -v | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)"
fi
[ -n "$APPLE_SIGNING_IDENTITY" ] || { echo "No Apple Development signing identity on this Mac (security find-identity -p codesigning)." >&2; exit 1; }
export APPLE_SIGNING_IDENTITY
echo "Signing as: $APPLE_SIGNING_IDENTITY"

nice -n 19 pnpm run build:ci
nice -n 19 pnpm exec tauri build --bundles app --config '{"build":{"beforeBuildCommand":""}}' -- -j4 || true

BUNDLE="${CARGO_TARGET_DIR:-../../target}/release/bundle/macos/Hanzo.app"
[ -d "$BUNDLE" ] || { echo "No bundle at $BUNDLE" >&2; exit 1; }
codesign --verify --strict "$BUNDLE"
[ "${1:-}" = "--no-install" ] && exit 0

osascript -e 'tell application id "ai.hanzo.desktop" to quit' 2>/dev/null || true
sleep 2
if [ -d /Applications/Hanzo.app ]; then
  rm -rf "/Applications/Hanzo.app.old-$(date +%Y%m%d)"
  mv /Applications/Hanzo.app "/Applications/Hanzo.app.old-$(date +%Y%m%d)"
fi
ditto "$BUNDLE" /Applications/Hanzo.app
codesign -dr - /Applications/Hanzo.app 2>&1 | grep designated
