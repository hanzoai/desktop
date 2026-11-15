#!/usr/bin/env bash
# Read secrets from Hanzo KMS with the CI identity.
#
#   kms.sh <path> <NAME>[=<VAR>]...    export each to the job, masked (as VAR if given)
#   . kms.sh; kms_read <path> <NAME>   print one value, for a step that keeps it to itself
#
# Reads org hanzo, env prod, at /<path>/<NAME>. KMS_CLIENT_ID and KMS_CLIENT_SECRET
# are the only credentials the repo holds; everything else lives in KMS. A name the
# identity may not read is an error that says which, never an empty value.

kms_token=

kms_read() {
  local endpoint=${KMS_ENDPOINT:-https://kms.hanzo.ai} body code value
  if [ -z "$kms_token" ]; then
    : "${KMS_CLIENT_ID:?KMS_CLIENT_ID is not set}" "${KMS_CLIENT_SECRET:?KMS_CLIENT_SECRET is not set}"
    kms_token=$(curl -fsS --retry 3 "$endpoint/v1/kms/auth/login" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg i "$KMS_CLIENT_ID" --arg s "$KMS_CLIENT_SECRET" '{clientId: $i, clientSecret: $s}')" \
      | jq -r '.accessToken // empty')
    [ -n "$kms_token" ] || { echo "kms: login refused for the CI identity" >&2; return 1; }
  fi
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' -H "Authorization: Bearer $kms_token" \
    "$endpoint/v1/kms/secrets/$1/$2?env=prod")
  value=$(jq -r '.value // empty' "$body" 2>/dev/null || true)
  if [ "$code" != 200 ] || [ -z "$value" ]; then
    echo "kms: /$1/$2 answered $code: $(jq -r '.detail // .title // empty' "$body" 2>/dev/null)" >&2
    rm -f "$body"; return 1
  fi
  rm -f "$body"
  printf '%s' "$value"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  path=$1; shift
  for spec in "$@"; do
    value=$(kms_read "$path" "${spec%%=*}")
    echo "::add-mask::$value"
    echo "${spec#*=}=$value" >> "$GITHUB_ENV"
  done
fi
