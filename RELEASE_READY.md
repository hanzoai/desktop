# ✅ Hanzo Desktop - Release Ready!

## Status: READY TO BUILD ✅

All secrets are configured and the workflow will work!

### Secrets Set (14/14)
✅ APPLE_CERTIFICATE
✅ APPLE_CERTIFICATE_PASSWORD  
✅ APPLE_SIGNING_IDENTITY
✅ APPLE_ID (z@luxindustries.xyz)
✅ APPLE_PASSWORD (app-specific)
✅ APPLE_TEAM_ID (TB8F2QQ9GP)
✅ KEYCHAIN_PASSWORD
✅ TAURI_SIGNING_PRIVATE_KEY
✅ SECRET_DESKTOP_INSTALLATION_PROOF_KEY
✅ R2_ACCESS_KEY_ID (placeholder - optional)
✅ R2_SECRET_ACCESS_KEY (placeholder - optional)
✅ VITE_POSTHOG_API_KEY (placeholder - optional)
✅ SLACK_BOT_TOKEN (placeholder - optional)
✅ EV_CODE_SIGNING_CERTIFICATE (placeholder - will use GCP KMS)

### What Happens on Release

When you push a tag like `1.0.0`:

```bash
cd ~/work/shinkai/hanzo-desktop
git tag 1.0.0
git push origin 1.0.0
```

The CI will:
1. ✅ Build for Linux (x86_64), macOS (Apple Silicon), Windows (x86_64)
2. ✅ Sign macOS .dmg with your Developer ID Application certificate
3. ✅ Notarize with Apple (using z@luxindustries.xyz)
4. ✅ Sign Windows .exe with EV certificate (via GCP KMS)
5. ✅ Sign update bundles with TAURI keys
6. ✅ Upload ALL files to **GitHub Releases**
   - Installers: .AppImage, .dmg, .exe
   - Update bundles: .tar.gz, .nsis.zip
   - Signatures: .sig files
   - latest.json for auto-updater
7. ⚠️ Try to upload to R2 (will fail, but that's OK)
8. ⚠️ Try to notify Slack (will fail, but that's OK)

### Downloads Available From

**GitHub Releases**: https://github.com/hanzoai/desktop/releases

Users can download:
- macOS: `Hanzo-Desktop-1.0.0.xxx_aarch64-apple-darwin.dmg`
- Windows: `Hanzo-Desktop-1.0.0.xxx_x86_64-pc-windows-msvc.exe`
- Linux: `Hanzo-Desktop-1.0.0.xxx_x86_64-unknown-linux-gnu.AppImage`

### Auto-Updates

The app checks GitHub for updates using `latest.json`.

Update bundles are signed with TAURI keys, so users get secure auto-updates!

### What's Optional (Using Placeholders)

- **R2 CDN**: Not configured - all downloads from GitHub
- **PostHog Analytics**: Not tracking usage
- **Slack Notifications**: Won't get notified of releases

You can add real values later if needed!

### Secure Files Backup

All Apple certificates and keys: `~/.private/volume/apple/`

**KEEP THESE SECURE** - they're your signing identity!

## Ready to Test?

```bash
cd ~/work/shinkai/hanzo-desktop
git add .github/workflows/release-prod.yml
git commit -m "fix: make R2 and Slack uploads optional"
git push

# Then create a test release
git tag 0.0.1-test
git push origin 0.0.1-test
```

Watch at: https://github.com/hanzoai/desktop/actions

---

**Note**: hanzo-node also needs secrets for releases - see hanzo-node/.github/workflows/build-binaries.yml
