# Apple Developer Setup for Hanzo Desktop Releases

## Required GitHub Secrets for macOS Code Signing

You need to configure these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### 1. APPLE_CERTIFICATE
**What**: Base64-encoded Developer ID Application certificate (.p12 file)

**How to get it**:
1. Log into https://developer.apple.com
2. Go to Certificates, Identifiers & Profiles
3. Create/download a **Developer ID Application** certificate (NOT iOS Distribution)
4. Import it into Keychain Access on your Mac
5. Right-click the certificate → Export as .p12
6. Set a strong password when exporting
7. Convert to base64:
   ```bash
   base64 -i /path/to/certificate.p12 | pbcopy
   ```
8. Add the base64 string to GitHub secrets as `APPLE_CERTIFICATE`

### 2. APPLE_CERTIFICATE_PASSWORD
**What**: The password you set when exporting the .p12 file

**How to set**: Add the password directly to GitHub secrets as `APPLE_CERTIFICATE_PASSWORD`

### 3. APPLE_SIGNING_IDENTITY
**What**: The certificate name/identity (usually looks like "Developer ID Application: Your Name (TEAM_ID)")

**How to get it**:
```bash
security find-identity -v -p codesigning
```
Look for the "Developer ID Application" line, copy the full string in quotes.

Add to GitHub secrets as `APPLE_SIGNING_IDENTITY`

### 4. APPLE_ID
**What**: Your Apple Developer account email

**How to set**: Add your developer account email to GitHub secrets as `APPLE_ID`

### 5. APPLE_PASSWORD
**What**: App-specific password (NOT your regular Apple ID password)

**How to get it**:
1. Go to https://appleid.apple.com
2. Sign in with your Apple ID
3. In the Security section, click "Generate Password" under App-Specific Passwords
4. Create one labeled "GitHub Actions" or "Hanzo Desktop CI"
5. Copy the generated password
6. Add to GitHub secrets as `APPLE_PASSWORD`

### 6. APPLE_TEAM_ID
**What**: Your Apple Developer Team ID

**How to get it**:
1. Go to https://developer.apple.com/account
2. Click on "Membership" in the sidebar
3. Your Team ID is shown there (10-character alphanumeric)
4. Add to GitHub secrets as `APPLE_TEAM_ID`

### 7. KEYCHAIN_PASSWORD
**What**: A password for the temporary keychain created during build (can be any strong password)

**How to set**: Generate a strong random password and add to GitHub secrets as `KEYCHAIN_PASSWORD`

---

## Additional Required Secrets (Non-Apple)

### Tauri Update Signing
- `TAURI_PRIVATE_KEY` - Generated with Tauri CLI
- `TAURI_KEY_PASSWORD` - Password for the private key

**Generate with**:
```bash
cd apps/hanzo-desktop/src-tauri
npx @tauri-apps/cli@latest signer generate -w ~/.tauri/myapp.key
```

### Windows Code Signing (Google Cloud KMS)
- `EV_CODE_SIGNING_CERTIFICATE` - EV certificate for Windows
- Google Cloud workload identity configured in workflow

### Other
- `VITE_POSTHOG_API_KEY` - PostHog analytics key
- `SECRET_DESKTOP_INSTALLATION_PROOF_KEY` - Installation verification key
- `R2_ACCESS_KEY_ID` - Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key
- `SLACK_BOT_TOKEN` - For release notifications

---

## Testing the Setup

Once all secrets are configured:

1. Create a version tag:
   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

2. The workflow will run automatically and should:
   - Build for macOS (Apple Silicon)
   - Sign the .dmg with your Developer ID
   - Notarize with Apple
   - Upload to GitHub Releases and R2

3. Check the Actions tab for the workflow run
4. If it fails, check the logs for which secret might be missing/incorrect

---

## Common Issues

**"codesign failed"**: Check APPLE_SIGNING_IDENTITY matches the certificate exactly

**"notarization failed"**: Verify APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID are correct

**"certificate not found"**: APPLE_CERTIFICATE might not be base64 encoded correctly

**"password incorrect"**: APPLE_CERTIFICATE_PASSWORD doesn't match the .p12 password
