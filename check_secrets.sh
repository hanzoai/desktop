#!/bin/bash

echo "Checking required secrets for hanzo-desktop release..."
echo ""

REPO="hanzoai/desktop"
REQUIRED_SECRETS=(
  "APPLE_CERTIFICATE"
  "APPLE_CERTIFICATE_PASSWORD"
  "APPLE_SIGNING_IDENTITY"
  "APPLE_ID"
  "APPLE_PASSWORD"
  "APPLE_TEAM_ID"
  "KEYCHAIN_PASSWORD"
  "TAURI_PRIVATE_KEY"
  "TAURI_KEY_PASSWORD"
  "R2_ACCESS_KEY_ID"
  "R2_SECRET_ACCESS_KEY"
  "VITE_POSTHOG_API_KEY"
  "SECRET_DESKTOP_INSTALLATION_PROOF_KEY"
  "EV_CODE_SIGNING_CERTIFICATE"
  "SLACK_BOT_TOKEN"
)

SECRETS=$(gh secret list --repo $REPO | awk '{print $1}')

for secret in "${REQUIRED_SECRETS[@]}"; do
  if echo "$SECRETS" | grep -q "^${secret}$"; then
    echo "✅ $secret"
  else
    echo "❌ $secret - MISSING"
  fi
done
