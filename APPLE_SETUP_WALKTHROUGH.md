# Apple Developer Setup - Complete Walkthrough

## Prerequisites
- ✅ macOS computer (you're on one)
- ✅ Apple Developer account
- ✅ Admin access to GitHub repository

---

## Step 1: Create Certificate Signing Request (CSR)

### 1.1 Open Keychain Access
```bash
open /Applications/Utilities/Keychain\ Access.app
```

### 1.2 Generate CSR
1. In Keychain Access menu: **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority**
2. Fill in the form:
   - **User Email Address**: Your email (e.g., you@example.com)
   - **Common Name**: Your name or company (e.g., "Hanzo AI")
   - **CA Email Address**: Leave blank
   - **Request is**: Select **"Saved to disk"**
   - Check **"Let me specify key pair information"**
3. Click **Continue**
4. Save as: `DeveloperIDApplication.certSigningRequest`
5. Click **Continue** again
6. Key Size: **2048 bits**
7. Algorithm: **RSA**
8. Click **Continue**

✅ You now have `DeveloperIDApplication.certSigningRequest` saved to disk

---

## Step 2: Create Developer ID Application Certificate

### 2.1 Go to Apple Developer Portal
Open browser: https://developer.apple.com/account/resources/certificates/list

### 2.2 Create Certificate
1. Click the **[+]** button (top left)
2. Under **Software**, select **"Developer ID Application"** (NOT "Developer ID Installer")
   - This is for signing apps distributed outside the Mac App Store
3. Click **Continue**

### 2.3 Upload CSR
1. Click **Choose File**
2. Select the `DeveloperIDApplication.certSigningRequest` you created
3. Click **Continue**

### 2.4 Download Certificate
1. Click **Download**
2. File will be named something like `developerID_application.cer`

✅ You now have the certificate file

---

## Step 3: Install and Export Certificate

### 3.1 Install Certificate
1. Double-click the downloaded `.cer` file
2. Keychain Access will open
3. Select **"login"** keychain
4. Click **Add**

### 3.2 Verify Installation
1. In Keychain Access, select **"login"** keychain on the left
2. Select **"My Certificates"** category
3. Look for a certificate that says **"Developer ID Application: [Your Name] ([TEAM_ID])"**
4. Expand it (▶) - you should see a private key underneath

### 3.3 Export as .p12
1. **Right-click** on the certificate (NOT the private key)
2. Select **"Export 'Developer ID Application: ...'"**
3. Save dialog appears:
   - **Save As**: `hanzo_developer_id.p12`
   - **Where**: Desktop (or anywhere you can find it)
   - **File Format**: Should show "Personal Information Exchange (.p12)"
4. Click **Save**
5. **Password prompt** appears:
   - Enter a strong password (e.g., generate one with: `openssl rand -base64 32`)
   - **IMPORTANT**: Save this password - you'll need it for `APPLE_CERTIFICATE_PASSWORD`
6. Click **OK**
7. Enter your **Mac password** to allow export

✅ You now have `hanzo_developer_id.p12` on your Desktop

---

## Step 4: Convert Certificate to Base64

### 4.1 Convert and Copy to Clipboard
```bash
cd ~/Desktop  # or wherever you saved the .p12
base64 -i hanzo_developer_id.p12 | pbcopy
```

✅ Base64 string is now in your clipboard (copied)

---

## Step 5: Get Signing Identity

### 5.1 Find Your Signing Identity
```bash
security find-identity -v -p codesigning
```

### 5.2 Copy the Identity String
Look for a line like:
```
  1) ABC123DEF456... "Developer ID Application: Your Name (TEAM123456)"
```

Copy the **entire string in quotes**, for example:
```
Developer ID Application: Hanzo AI (ABC1234567)
```

✅ This is your `APPLE_SIGNING_IDENTITY`

---

## Step 6: Get Apple Team ID

### 6.1 Visit Membership Page
Open browser: https://developer.apple.com/account#!/membership

### 6.2 Copy Team ID
Look for **Team ID** - it's a 10-character code like `ABC1234567`

✅ This is your `APPLE_TEAM_ID`

---

## Step 7: Generate App-Specific Password

### 7.1 Go to Apple ID Security
Open browser: https://appleid.apple.com/account/manage

### 7.2 Sign In
Use your Apple ID credentials (may require 2FA)

### 7.3 Generate Password
1. Scroll to **"Sign-In and Security"** section
2. Click **"App-Specific Passwords"**
3. Click **[+]** or **"Generate an app-specific password"**
4. Label: **"Hanzo Desktop CI"** (or any name you want)
5. Click **Create**
6. **Copy the password** (format: `xxxx-xxxx-xxxx-xxxx`)
   - You won't be able to see it again!

✅ This is your `APPLE_PASSWORD`

---

## Step 8: Generate Keychain Password

### 8.1 Generate Random Password
```bash
openssl rand -base64 32
```

Copy the output (e.g., `abc123def456...`)

✅ This is your `KEYCHAIN_PASSWORD` (can be any strong password)

---

## Step 9: Add Secrets to GitHub

### 9.1 Navigate to GitHub Secrets
1. Go to your repository: https://github.com/hanzoai/desktop
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **New repository secret** button

### 9.2 Add Each Secret

Add these **7 secrets** one by one:

| Secret Name | Value | Where You Got It |
|-------------|-------|------------------|
| `APPLE_CERTIFICATE` | Paste from clipboard (base64 from Step 4) | Base64 conversion |
| `APPLE_CERTIFICATE_PASSWORD` | Password you set when exporting .p12 | Step 3.3 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Your Name (TEAM_ID)` | Step 5 |
| `APPLE_ID` | Your Apple Developer email | Your Apple ID |
| `APPLE_PASSWORD` | `xxxx-xxxx-xxxx-xxxx` format | Step 7 |
| `APPLE_TEAM_ID` | 10-character code | Step 6 |
| `KEYCHAIN_PASSWORD` | Random password | Step 8 |

For each secret:
1. Click **"New repository secret"**
2. **Name**: Enter the secret name (e.g., `APPLE_CERTIFICATE`)
3. **Secret**: Paste the value
4. Click **"Add secret"**

---

## Step 10: Verify Setup

### 10.1 Check All Secrets Are Added
In GitHub → Settings → Secrets and variables → Actions, you should see all 7:
- ✅ APPLE_CERTIFICATE
- ✅ APPLE_CERTIFICATE_PASSWORD
- ✅ APPLE_SIGNING_IDENTITY
- ✅ APPLE_ID
- ✅ APPLE_PASSWORD
- ✅ APPLE_TEAM_ID
- ✅ KEYCHAIN_PASSWORD

### 10.2 Test with a Release
```bash
cd ~/work/shinkai/hanzo-desktop
git checkout main
git pull

# Create test tag
git tag 1.0.0-test
git push origin 1.0.0-test
```

Watch the workflow: https://github.com/hanzoai/desktop/actions

---

## Troubleshooting

### "Certificate not found" error
- Make sure the certificate is in the "login" keychain, not "System"
- Verify the private key is under the certificate when you expand it

### "Incorrect password" error
- Check `APPLE_CERTIFICATE_PASSWORD` matches the password from Step 3.3

### "Notarization failed" error
- Verify `APPLE_ID` is correct
- Verify `APPLE_PASSWORD` is the app-specific password, not your regular password
- Check `APPLE_TEAM_ID` is correct

### "Code signing failed" error
- Verify `APPLE_SIGNING_IDENTITY` exactly matches the output from Step 5
- Make sure quotes are NOT included in the GitHub secret

---

## Security Notes

- The .p12 file contains your private key - keep it secure
- App-specific passwords can be revoked if compromised
- GitHub secrets are encrypted and only visible during workflow runs
- Delete the .p12 file from your Desktop after uploading to GitHub

---

## Next Steps

Once all secrets are added:
1. Generate Tauri signing keys (see RELEASE_SETUP.md)
2. Verify other infrastructure secrets (R2, PostHog, etc.)
3. Run a test release
4. Monitor the GitHub Actions workflow
5. Download and test the signed .dmg

Need help? Check the main RELEASE_SETUP.md for complete documentation.
