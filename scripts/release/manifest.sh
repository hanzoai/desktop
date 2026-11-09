#!/usr/bin/env bash
# SHA256SUMS and latest.json for a release, computed from what the release holds.
#
#   manifest.sh <release id> <tag> <version>
#
# Idempotent: it reads the assets, writes two files, and replaces the two assets of
# those names, so it can run after every upload and in any order. The Linux and
# Windows legs run it when their bundles are in; the macOS workflow runs it when its
# bundle is, possibly days later, and the manifest then gains the darwin platforms.
#
# latest.json is the Tauri v2 updater document the app's endpoint
# (releases/latest/download/latest.json) serves. A platform appears only when its
# bundle AND that bundle's .sig are on the release, because the updater treats a
# missing platform as "no update" and a listed one as a promise.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
. "$here/gh.sh"

rid=$1 tag=$2 version=$3
assets=$(release_assets "$rid")
out=$(mktemp -d)

# SHA256SUMS from the digest GitHub computed for each asset: the sums describe the
# bytes the release serves, and 3 GB is not downloaded to learn them.
jq -r '.[] | select(.name != "SHA256SUMS" and .name != "latest.json")
       | if (.digest // "") | startswith("sha256:") then "\(.digest[7:])  \(.name)"
         else error("no sha256 digest for \(.name)") end' <<<"$assets" | LC_ALL=C sort -k2 > "$out/SHA256SUMS"
[ -s "$out/SHA256SUMS" ] || { echo "manifest: release $tag holds no assets" >&2; exit 1; }

has() { jq -e --arg n "$1" 'any(.[]; .name == $n)' <<<"$assets" >/dev/null; }
sig() {
  local id
  id=$(jq -r --arg n "$1.sig" '.[] | select(.name == $n) | .id' <<<"$assets")
  curl -fsSL --retry 3 -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" \
    "$api_base/releases/assets/$id" | tr -d '\n'
}

base=https://github.com/$GITHUB_REPOSITORY/releases/download/$tag
platforms='{}'
# <bundle name>  <updater platform keys>
while read -r bundle keys; do
  has "$bundle" && has "$bundle.sig" || continue
  s=$(sig "$bundle")
  for key in $keys; do
    platforms=$(jq --arg k "$key" --arg s "$s" --arg u "$base/$bundle" \
      '. + {($k): {signature: $s, url: $u}}' <<<"$platforms")
  done
done <<LIST
Hanzo_Desktop_${version}_amd64.AppImage linux-x86_64 linux-x86_64-appimage
Hanzo_Desktop_${version}_arm64.AppImage linux-aarch64 linux-aarch64-appimage
Hanzo_Desktop_${version}_amd64.deb linux-x86_64-deb
Hanzo_Desktop_${version}_arm64.deb linux-aarch64-deb
Hanzo_Desktop-${version}-1.x86_64.rpm linux-x86_64-rpm
Hanzo_Desktop-${version}-1.aarch64.rpm linux-aarch64-rpm
Hanzo_Desktop_${version}_x64-setup.exe windows-x86_64 windows-x86_64-nsis
Hanzo_Desktop_${version}_universal.app.tar.gz darwin-aarch64 darwin-x86_64 darwin-aarch64-app darwin-x86_64-app
LIST
[ "$platforms" != '{}' ] || { echo "manifest: no signed bundle on $tag, refusing an empty latest.json" >&2; exit 1; }

jq -n --arg v "$version" --arg n "Hanzo Desktop $version" --arg d "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson p "$platforms" '{version: $v, notes: $n, pub_date: $d, platforms: $p}' > "$out/latest.json"

asset_put "$rid" "$out/SHA256SUMS"
asset_put "$rid" "$out/latest.json"
echo "latest.json platforms: $(jq -r '.platforms | keys | join(", ")' "$out/latest.json")"
rm -rf "$out"
