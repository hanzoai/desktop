# Google Cloud Configuration for Windows Code Signing

## Project Information
**Project ID**: `hanzo-inc`
**Project Number**: `113591532635`

## Workload Identity Federation
**Pool Name**: `github`
**Provider Name**: `hanzo-apps`
**Full Provider Path**: `projects/113591532635/locations/global/workloadIdentityPools/github/providers/hanzo-apps`

**Configuration**:
- Issuer: `https://token.actions.githubusercontent.com`
- Repository: `hanzoai/desktop`
- Owner Filter: `hanzoai`

## Service Account
**Email**: `github-ksm-ev-code-signing@hanzo-inc.iam.gserviceaccount.com`
**Purpose**: GitHub Actions authentication for EV code signing

**Permissions**:
- Workload Identity User (for GitHub Actions)
- Cloud KMS Signer/Verifier (for signing Windows binaries)

## KMS Configuration
**Location**: `us`
**Keyring**: `hanzo-apps`
**Key Name**: `EVCodeSigning`
**Algorithm**: RSA 4096 SHA-256
**Full Path**: `projects/hanzo-inc/locations/us/keyRings/hanzo-apps`

## GitHub Secrets Required
The following secrets should be configured at: https://github.com/hanzoai/desktop/settings/secrets/actions

### Already Configured
- ✅ `EV_CODE_SIGNING_CERTIFICATE` - The public certificate (.cer file)
- ✅ `TAURI_PRIVATE_KEY` - Tauri updater private key
- ✅ `TAURI_KEY_PASSWORD` - Tauri updater key password

### No Additional Secrets Needed
The workload identity federation handles authentication automatically - no service account keys needed!

## To Import Your EV Certificate Private Key to KMS

If you have the EV certificate private key (from hanzo-412316 or elsewhere), import it:

```bash
# First, export the private key from the old location or certificate file
# (You would need access to the old hanzo-412316 project or the original cert)

# Then import to the new KMS key:
gcloud kms keys versions import \
    --location=us \
    --keyring=hanzo-apps \
    --key=EVCodeSigning \
    --algorithm=rsa-sign-pkcs1-4096-sha256 \
    --import-job=YOUR_IMPORT_JOB_NAME \
    --rsa-aes-wrapped-key-file=wrapped-key.bin \
    --project=hanzo-inc
```

**Note**: If you don't have the private key from the old setup, you'll need to:
1. Generate a new CSR from this KMS key
2. Submit to your certificate authority to get a new EV certificate
3. Store the new public certificate in the `EV_CODE_SIGNING_CERTIFICATE` GitHub secret

## Verification

Test the setup with:
```bash
# Check workload identity pool
gcloud iam workload-identity-pools describe github \
    --location=global \
    --project=hanzo-inc

# Check service account bindings
gcloud iam service-accounts get-iam-policy \
    github-ksm-ev-code-signing@hanzo-inc.iam.gserviceaccount.com \
    --project=hanzo-inc

# Check KMS key
gcloud kms keys describe EVCodeSigning \
    --location=us \
    --keyring=hanzo-apps \
    --project=hanzo-inc
```

## Current Status
- ✅ Workload Identity Pool created
- ✅ OIDC Provider configured for GitHub Actions
- ✅ Service Account created and bound
- ✅ KMS Keyring and Key created
- ✅ Permissions granted
- ✅ Workflow updated to use hanzo-inc
- ⚠️  EV Certificate private key needs to be imported to KMS (or new cert generated)

---

*Last updated: 2025-11-06*
*Configuration by: z@zoo.ngo*
