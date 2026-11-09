#!/usr/bin/env bash
# Which release this run is for, and the draft that collects its assets.
#
#   meta.sh
#
# A run on a v* tag is a release: the tag must be v<version> for the version in
# package.json, the one place Hanzo Desktop's number is written. Any other run is a
# dry run: it makes the same bundles and the same uploads against a draft release
# named for the run, which nobody can see and the last job deletes.
#
# Outputs: mode (release|dry-run), tag, version, prerelease, release (the id).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
. "$here/gh.sh"

version=$(jq -r .version "$root/package.json")
if [ "${GITHUB_REF_TYPE:-}" = tag ] && [ "$GITHUB_EVENT_NAME" != pull_request ]; then
  mode=release
  tag=$GITHUB_REF_NAME
  [ "$tag" = "v$version" ] || { echo "::error::the tag is $tag and package.json declares $version"; exit 1; }
else
  mode=dry-run
  tag=dry-run-$GITHUB_RUN_ID
fi
prerelease=false
case $version in *-*) prerelease=true ;; esac

release=$(release_ensure "$tag" "Hanzo Desktop $tag" "$prerelease" "${PR_HEAD_SHA:-$GITHUB_SHA}")
{
  echo "mode=$mode"
  echo "tag=$tag"
  echo "version=$version"
  echo "prerelease=$prerelease"
  echo "release=$release"
} >> "$GITHUB_OUTPUT"
echo "$mode: $tag (release $release)"
