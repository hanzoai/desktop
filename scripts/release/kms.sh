#!/usr/bin/env bash
# Read secrets from Hanzo KMS with the CI identity and export them to the job, masked.
#
#   kms.sh <path> <NAME>...
#
# Reads org hanzo, env prod, at /<path>/<NAME>. KMS_CLIENT_ID and KMS_CLIENT_SECRET
# are the only credentials the repo holds; everything else lives in KMS. A name the
# identity may not read is an error that says which, never an empty variable.
set -euo pipefail

endpoint=${KMS_ENDPOINT:-https://kms.hanzo.ai}
path=$1; shift
: "${KMS_CLIENT_ID:?KMS_CLIENT_ID is not set}" "${KMS_CLIENT_SECRET:?KMS_CLIENT_SECRET is not set}"

token=$(curl -fsS --retry 3 "$endpoint/v1/kms/auth/login" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg i "$KMS_CLIENT_ID" --arg s "$KMS_CLIENT_SECRET" '{clientId: $i, clientSecret: $s}')" \
  | jq -r '.accessToken // empty')
[ -n "$token" ] || { echo "kms: login refused for the CI identity" >&2; exit 1; }

for name in "$@"; do
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' -H "Authorization: Bearer $token" \
    "$endpoint/v1/kms/secrets/$path/$name?env=prod")
  value=$(jq -r '.value // empty' "$body" 2>/dev/null || true)
  if [ "$code" != 200 ] || [ -z "$value" ]; then
    echo "kms: /$path/$name answered $code: $(jq -r '.detail // .title // empty' "$body" 2>/dev/null)" >&2
    rm -f "$body"; exit 1
  fi
  rm -f "$body"
  echo "::add-mask::$value"
  echo "$name=$value" >> "$GITHUB_ENV"
done
