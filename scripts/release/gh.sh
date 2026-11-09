#!/usr/bin/env bash
# GitHub release calls for the desktop release lane. Sourced, not run. The runner
# image has curl and jq and no gh.
#
# Needs GITHUB_REPOSITORY and GITHUB_TOKEN (the job's, with contents: write).

api_base=${GITHUB_API_URL:-https://api.github.com}/repos/$GITHUB_REPOSITORY
upload_base=https://uploads.github.com/repos/$GITHUB_REPOSITORY

api() {
  curl -fsS --retry 3 -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

# The id of the release for a tag, draft or not, or nothing. /releases/tags/<tag>
# does not return drafts, so the list is read.
release_find() {
  local page=1 out id
  while :; do
    out=$(api "$api_base/releases?per_page=100&page=$page")
    id=$(jq -r --arg t "$1" '[.[] | select(.tag_name == $t)][0].id // empty' <<<"$out")
    if [ -n "$id" ]; then echo "$id"; return 0; fi
    [ "$(jq length <<<"$out")" -eq 100 ] || return 0
    page=$((page + 1))
  done
}

# release_ensure <tag> <name> <prerelease:true|false> <commit> -> id. A new release
# starts as a draft: nobody sees it until release_publish, so the updater endpoint
# never answers for a release that has no latest.json yet.
release_ensure() {
  local id
  id=$(release_find "$1")
  if [ -z "$id" ]; then
    id=$(api -X POST "$api_base/releases" -H 'Content-Type: application/json' -d "$(jq -nc \
      --arg t "$1" --arg n "$2" --argjson pre "$3" --arg c "$4" \
      '{tag_name: $t, name: $n, draft: true, prerelease: $pre, target_commitish: $c, generate_release_notes: true}')" | jq -r .id)
  fi
  echo "$id"
}

release_assets() { api "$api_base/releases/$1/assets?per_page=100"; }

# release_publish <id> <prerelease:true|false>
release_publish() {
  local latest=true; [ "$2" = false ] || latest=false
  api -X PATCH "$api_base/releases/$1" -H 'Content-Type: application/json' \
    -d "$(jq -nc --argjson pre "$2" --arg l "$latest" '{draft: false, prerelease: $pre, make_latest: $l}')" >/dev/null
}

release_delete() { api -X DELETE "$api_base/releases/$1" >/dev/null; }

# asset_put <release id> <file> [name]: upload, replacing a same-named asset, and
# check what arrived is the size that left. A 600 MB upload is dropped now and then;
# a dropped one leaves a half asset of the same name that blocks the next try.
asset_put() {
  local rid=$1 file=$2 name=${3:-$(basename "$2")} size aid got try
  size=$(wc -c < "$file" | tr -d ' ')
  for try in 1 2 3 4 5 6; do
    for aid in $(release_assets "$rid" | jq -r --arg n "$name" '.[] | select(.name == $n) | .id'); do
      api -X DELETE "$api_base/releases/assets/$aid" >/dev/null
    done
    if curl -fsS --max-time 3000 -X POST -o /dev/null \
        -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/octet-stream" \
        --data-binary @"$file" "$upload_base/releases/$rid/assets?name=$(jq -rn --arg n "$name" '$n|@uri')"; then
      got=$(release_assets "$rid" | jq -r --arg n "$name" '.[] | select(.name == $n) | .size')
      if [ "$got" = "$size" ]; then echo "uploaded $name ($size bytes)"; return 0; fi
    fi
    echo "upload of $name failed (try $try)" >&2; sleep $((try * 10))
  done
  return 1
}
