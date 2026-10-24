---
title: "Store publishing"
audience: app-developer
status: planned
---
# Capsule Framework — Store Publishing

> Automated pipeline from `capsule build` to live in the Play Store and App Store. How the APIs work, what credentials are needed, and how Fastlane bridges the gap.
>
> **Different "publish":** this doc is about shipping *apps built with Capsule* to the app stores.
> For publishing *the framework itself* (git repos + npm/Maven packages, de-Windows, license, docs
> split) see [`release.md`](../contributing/release.md).

---

## Two Release Layers

Before diving in, the distinction matters:

```
Layer 1 — Store Release (this document)
  Full APK/IPA → Play Store / App Store review
  Required when: native shell update, new permissions, new native plugins
  Time: hours to days (review)
  Controlled by: capsule publish android|ios

Layer 2 — CodeSync OTA (ota-updates.md)
  JS bundle only → direct to devices, no review
  Required when: web code changes (JS, CSS, HTML, assets)
  Time: seconds
  Controlled by: capsule codesync publish
```

These are complementary, not competing. A typical release cycle:
- Ship a new store version to add a native feature (Layer 1)
- Then iterate the UI weekly via CodeSync (Layer 2) without touching the store

---

## Google Play Store

### How the API Works

Google exposes the **Google Play Developer API** (REST + gRPC). It manages:
- Uploading APK / AAB (Android App Bundle)
- Assigning builds to tracks (internal → alpha → beta → production)
- Staged rollouts (0–100% of production users)
- Release notes per language
- Listing current live versions

**Authentication**: A **service account** with a JSON key file. The service account is granted access to your app in the Play Console. It uses OAuth 2.0 with JWT assertion — no browser login required, fully automated.

### Setting Up Play Store Access

**Step 1 — Create a service account in Google Cloud Console**:
```
Google Cloud Console → IAM & Admin → Service Accounts
→ Create Service Account
→ Role: not needed here (Play grants its own permissions)
→ Create Key → JSON → download to secure location
```

**Step 2 — Grant the service account access in Play Console**:
```
Play Console → Setup → API access
→ Link to Google Cloud project
→ Grant access to service account
→ Permissions: Release manager (or App manager for full control)
```

**Step 3 — Store the key securely**:
```bash
# Never commit the JSON key. Use environment variables or a secrets manager.
export PLAY_STORE_JSON_KEY=/path/to/service-account.json
# Or base64-encode it for CI:
export PLAY_STORE_JSON_KEY_DATA=$(base64 -w0 service-account.json)
```

### Tracks and Staged Rollouts

```
internal   →   alpha   →   beta   →   production
  (team)    (invited)   (opt-in)    (all users)

Production supports staged rollout: 10% → 50% → 100%
```

The API call to promote a build to production at 10%:
```json
PUT /androidpublisher/v3/applications/{packageName}/edits/{editId}/tracks/production
{
  "releases": [{
    "versionCodes": ["42"],
    "status": "inProgress",
    "userFraction": 0.10,
    "releaseNotes": [{ "language": "en-US", "text": "Bug fixes" }]
  }]
}
```

### AAB vs APK

**Always use AAB (Android App Bundle)** for Play Store uploads:
- Google generates optimized APKs per device configuration
- ~20-30% smaller downloads vs universal APK
- Required for new apps since Aug 2021

```bash
# In capsule build pipeline:
./gradlew bundleRelease    # produces .aab
# vs
./gradlew assembleRelease  # produces .apk (for sideloading / direct install only)
```

---

## Apple App Store

### How the API Works

Apple provides the **App Store Connect API** (REST). It manages:
- Uploading IPA builds
- Submitting for TestFlight beta testing
- Submitting for App Store review
- Managing phased releases
- App metadata, screenshots, pricing

**Authentication**: An **API key** (`.p8` private key file) combined with a Key ID and Issuer ID. Generates a short-lived JWT for each API request. No Apple ID login required, fully headless.

### Three Key Pieces of iOS Identity

Understanding this is critical before any automation:

```
1. Distribution Certificate (.p12)
   → Proves the binary was built by your team
   → Issued by Apple, stored in macOS Keychain or encrypted file
   → Expires every year — must be renewed

2. Provisioning Profile (.mobileprovision)
   → Ties: app ID + certificate + allowed devices (for dev) or "any" (for distribution)
   → App Store distribution profile: no device restriction
   → Expires, must be regenerated when cert changes

3. App Store Connect API Key (.p8)
   → Used only for API calls (upload, submit, metadata)
   → Does NOT replace certificate or provisioning profile
   → Never expires, but can be revoked
```

### Setting Up App Store Connect API Access

**Step 1 — Generate API Key**:
```
App Store Connect → Users and Access → Keys
→ Generate API Key
→ Select role: Admin (for full publishing) or App Manager
→ Download .p8 file (ONE TIME — cannot re-download)
→ Note: Key ID (10-char string) and Issuer ID (UUID)
```

**Step 2 — Store securely**:
```bash
# The .p8 file is a private key — treat like a password
export APP_STORE_CONNECT_KEY_ID=XXXXXXXXXX
export APP_STORE_CONNECT_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export APP_STORE_CONNECT_KEY_CONTENT=$(cat AuthKey_XXXXXXXXXX.p8 | base64)
```

**Step 3 — Certificate + Profile management via Fastlane Match**:

Fastlane Match solves the multi-developer certificate problem by storing encrypted certificates in a private git repo or S3 bucket. Every developer and CI machine fetches from the same source:

```bash
# First time setup
fastlane match init
# → Choose storage (git / s3 / google_cloud)
# → Enter git repo URL (private repo)

# Generate and store distribution cert + profile
fastlane match appstore

# On CI: read-only mode (never regenerate, just fetch)
fastlane match appstore --readonly
```

Match encrypts with a passphrase (`MATCH_PASSWORD` env var). The private key never leaves the machine unencrypted.

### TestFlight vs Production

```
TestFlight (beta)
  → Upload IPA → automatic processing (~10 min)
  → Internal testers: instant, no review
  → External testers: one-time beta review (1-2 days)
  → CLI: capsule publish ios --track testflight

App Store (production)
  → Upload IPA → App Store review (24-48 hrs typical, can be longer)
  → Phased release: roll out to 1%→2%→5%→10%→20%→50%→100% over 7 days
  → Manual override to pause or accelerate
  → CLI: capsule publish ios --track production
```

---

## Fastlane as the Integration Layer

Capsule wraps Fastlane. Developers never write a `Fastfile`. The CLI generates it from `capsule.config.ts` and then invokes it.

### Why Fastlane

- Battle-tested (used by Airbnb, Twitter, Google, etc.)
- Handles the gnarly parts: signing, build number increment, upload retry on network error, screenshot upload
- MIT licensed, active maintenance
- Supports both Play Store (`supply` action) and App Store (`deliver` + `pilot` actions)

### What `capsule publish android` Does Internally

```
capsule publish android --track production --rollout 10

1. capsule build android --release
   └─ Vite build → dist/
   └─ gradlew bundleRelease → app-release.aab

2. CLI generates Fastfile in .capsule/fastlane/
   └─ lane :publish_android do
        supply(
          track: 'production',
          rollout: '0.1',
          aab: '.capsule/android/app-release.aab',
          json_key: ENV['PLAY_STORE_JSON_KEY'],
          package_name: 'com.yourcompany.app',
          skip_upload_apk: true,
          release_status: 'inProgress'
        )
      end

3. fastlane publish_android
   └─ Authenticates with service account JSON
   └─ Creates Play edit (transaction)
   └─ Uploads AAB
   └─ Assigns to production track at 10% rollout
   └─ Commits the edit → goes live
```

### What `capsule publish ios` Does Internally

```
capsule publish ios --track testflight

1. capsule build ios --release
   └─ Vite build → dist/
   └─ xcodebuild archive → .xcarchive
   └─ xcodebuild exportArchive → .ipa

2. CLI generates Fastfile in .capsule/fastlane/
   └─ lane :publish_ios do
        pilot(
          ipa: '.capsule/ios/MyApp.ipa',
          api_key_path: '.capsule/fastlane/app_store_connect_key.json',
          skip_waiting_for_build_processing: true,
          changelog: ENV['RELEASE_NOTES'] || 'New build'
        )
      end

3. fastlane publish_ios
   └─ Authenticates with App Store Connect API key
   └─ Uploads IPA via Transporter protocol
   └─ Triggers TestFlight distribution (or production submission)
```

The `app_store_connect_key.json` is a temp file the CLI writes from env vars — never persisted to disk after the session.

---

## `capsule.config.ts` — Full Publishing Config

```typescript
export default defineConfig({
  appId: 'com.yourcompany.app',
  appName: 'My App',

  android: {
    minSdk: 26,
    targetSdk: 35,
    compileSdk: 35,
    permissions: ['CAMERA', 'NOTIFICATIONS'],

    signing: {
      storeFile:     process.env.CAPSULE_KEYSTORE_PATH,
      storePassword: process.env.CAPSULE_KEYSTORE_PASS,
      keyAlias:      process.env.CAPSULE_KEY_ALIAS,
      keyPassword:   process.env.CAPSULE_KEY_PASS
    },

    publish: {
      serviceAccountKey: process.env.PLAY_STORE_JSON_KEY,   // path to .json file
      // OR:
      serviceAccountKeyData: process.env.PLAY_STORE_JSON_KEY_DATA,  // base64-encoded
      defaultTrack: 'internal',   // where new builds land by default
      packageName: 'com.yourcompany.app'  // if different from appId
    }
  },

  ios: {
    deployment: '16.0',
    capabilities: ['push-notifications', 'camera'],
    bundleId: 'com.yourcompany.app',

    signing: {
      matchGitUrl:     process.env.MATCH_GIT_URL,           // private repo with certs
      matchPassword:   process.env.MATCH_PASSWORD,
      teamId:          process.env.APPLE_TEAM_ID
    },

    publish: {
      apiKeyId:       process.env.APP_STORE_CONNECT_KEY_ID,
      apiIssuerId:    process.env.APP_STORE_CONNECT_ISSUER_ID,
      apiKeyContent:  process.env.APP_STORE_CONNECT_KEY_CONTENT,  // base64 .p8
      defaultTrack:   'testflight'
    }
  }
})
```

---

## CLI Publishing Commands in Full

```bash
# Android
capsule publish android                          # upload to defaultTrack (internal)
capsule publish android --track alpha            # upload to alpha
capsule publish android --track production       # submit to production
capsule publish android --track production --rollout 10   # 10% staged rollout
capsule publish android --rollout 50             # increase existing rollout to 50%
capsule publish android --rollout 100            # full rollout (complete staged release)
capsule publish android --pause                  # halt staged rollout

# iOS
capsule publish ios                              # upload to TestFlight (defaultTrack)
capsule publish ios --track testflight           # TestFlight internal testing
capsule publish ios --track testflight-external  # TestFlight external (needs beta review)
capsule publish ios --track production           # submit for App Store review
capsule publish ios --track production --phased  # enable 7-day phased release
capsule publish ios --pause-phased               # pause phased release
capsule publish ios --resume-phased              # resume paused phased release

# Version management
capsule version                                  # show current version codes
capsule version bump patch                       # 1.4.2 → 1.4.3
capsule version bump minor                       # 1.4.2 → 1.5.0
capsule version set 2.0.0                        # explicit version
```

---

## Version Code Management

Both platforms require a monotonically increasing integer build number alongside the human-readable version string.

| Platform | Human version | Build number | Notes |
|----------|--------------|--------------|-------|
| Android | `versionName` (e.g. `"1.4.2"`) | `versionCode` (e.g. `47`) | versionCode must increase with every upload |
| iOS | `CFBundleShortVersionString` (e.g. `"1.4.2"`) | `CFBundleVersion` (e.g. `47`) | Same requirement |

Capsule stores both in `capsule.config.ts` and auto-increments `versionCode`/`CFBundleVersion` on each `capsule publish`:

```typescript
// capsule.config.ts (managed by CLI — do not hand-edit build numbers)
version: {
  name: '1.4.2',
  buildNumber: 47   // auto-incremented by `capsule publish`
}
```

The CLI commits the bumped `buildNumber` back to `capsule.config.ts` after a successful upload. In CI, configure git so this commit is created by a bot account.

---

## CI/CD Pipeline — Full End-to-End

```yaml
# .github/workflows/release.yml

name: Release

on:
  push:
    tags: ['v*']

jobs:
  # ─── Android ────────────────────────────────────────────────────────────────
  release-android:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/capsule/build-android:latest

    steps:
      - uses: actions/checkout@v4

      - name: Restore keystore from secret
        run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > /tmp/keystore.jks

      - name: Build + publish to Play Store (internal track)
        run: capsule publish android --track internal
        env:
          CAPSULE_KEYSTORE_PATH:      /tmp/keystore.jks
          CAPSULE_KEYSTORE_PASS:      ${{ secrets.KEYSTORE_PASS }}
          CAPSULE_KEY_ALIAS:          ${{ secrets.KEY_ALIAS }}
          CAPSULE_KEY_PASS:           ${{ secrets.KEY_PASS }}
          PLAY_STORE_JSON_KEY_DATA:   ${{ secrets.PLAY_STORE_JSON_KEY_DATA }}

  # ─── iOS ────────────────────────────────────────────────────────────────────
  release-ios:
    runs-on: macos-15    # required — Xcode only runs on macOS

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }

      - run: npm install -g @capsule/cli

      - name: Install signing via Fastlane Match
        run: bundle exec fastlane match appstore --readonly
        env:
          MATCH_GIT_URL:      ${{ secrets.MATCH_GIT_URL }}
          MATCH_PASSWORD:     ${{ secrets.MATCH_PASSWORD }}
          APPLE_TEAM_ID:      ${{ secrets.APPLE_TEAM_ID }}

      - name: Build + publish to TestFlight
        run: capsule publish ios --track testflight
        env:
          APP_STORE_CONNECT_KEY_ID:      ${{ secrets.ASC_KEY_ID }}
          APP_STORE_CONNECT_ISSUER_ID:   ${{ secrets.ASC_ISSUER_ID }}
          APP_STORE_CONNECT_KEY_CONTENT: ${{ secrets.ASC_KEY_CONTENT }}
```

---

## Staged Rollout Coordination: Store + CodeSync

Both layers support gradual rollouts. Here is how they work together:

```
Day 0: capsule publish android --track production --rollout 5
       → 5% of users get the new native binary
       → They also run the new JS bundle (included in the APK)

Day 1: capsule codesync publish --rollout 10
       → All users on the OLD native version get the new JS bundle
       → The 5% on the new native also get it (compatible)

Day 3: capsule publish android --rollout 25
       → 25% of users now on new native

Day 5: capsule publish android --rollout 100
       → All users on new native
       capsule codesync rollout 100
       → All devices running the latest JS bundle
```

**Key rule**: CodeSync bundles must declare `minNativeVersion`. If a new JS bundle requires a new native feature:

```typescript
// Only deliver this bundle to devices on native v2.0+
capsule codesync publish --min-native-version 2.0.0
```

Devices still on native v1.x keep running the previous JS bundle until they update from the store.

---

## Direct APK Distribution (No Store)

For enterprise apps, internal tooling, or beta testers outside TestFlight/Play:

```bash
# Build a signed APK (not AAB — direct install requires APK)
capsule build android --release --format apk

# Output: .capsule/android/app-release.apk
# Distribute via:
#   - MDM (Mobile Device Management): Intune, Jamf, VMware Workspace ONE
#   - Internal download page (HTTPS required on Android 8+)
#   - ADB: adb install app-release.apk
```

**iOS direct distribution** (no App Store) requires:
- Enterprise Distribution Certificate (Apple Developer Enterprise Program — $299/yr)
- In-house provisioning profile (no device limit, no App Store review)
- Distributed via MDM or HTTPS manifest plist

```bash
capsule build ios --release --distribution enterprise
# Generates: .capsule/ios/MyApp.ipa + manifest.plist
# Host on HTTPS server → users open itms-services://?action=download-manifest&url=...
```

---

## Secrets Management Reference

Never hardcode any of these. Use environment variables, a secrets manager, or GitHub/GitLab/Azure secrets.

| Secret | Platform | How to get | How to store |
|--------|----------|-----------|-------------|
| `KEYSTORE_BASE64` | Android | `keytool -genkey` (first time) | Base64-encode `.jks`, store as repo secret |
| `KEYSTORE_PASS` | Android | You set this | Repo secret |
| `KEY_ALIAS` | Android | You set this | Repo secret |
| `KEY_PASS` | Android | You set this | Repo secret |
| `PLAY_STORE_JSON_KEY_DATA` | Android | Google Cloud service account | Base64-encode JSON, repo secret |
| `MATCH_GIT_URL` | iOS | Private git repo you create | Repo secret |
| `MATCH_PASSWORD` | iOS | You set this (encrypts the cert repo) | Repo secret |
| `APPLE_TEAM_ID` | iOS | Apple Developer portal (10-char) | Repo secret |
| `ASC_KEY_ID` | iOS | App Store Connect → Keys | Repo secret |
| `ASC_ISSUER_ID` | iOS | App Store Connect → Keys | Repo secret |
| `ASC_KEY_CONTENT` | iOS | Base64-encode the `.p8` file | Repo secret |

**First-time keystore generation** (run once, store the result):
```bash
keytool -genkey -v \
  -keystore my-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias \
  -dname "CN=My App, OU=Mobile, O=My Company, L=City, S=State, C=US"

# Then base64-encode and store:
base64 -w0 my-release-key.jks > keystore.b64
# → paste keystore.b64 content into KEYSTORE_BASE64 repo secret
# → DELETE the .jks and .b64 files from your machine
# → The canonical copy is the repo secret
```

> **Android keystore warning**: If you lose this keystore, you can never update your app on the Play Store. The Play Store ties your app's identity to the keystore forever. Fastlane Match solves the iOS equivalent. For Android, store the keystore in at minimum two independent secure locations.

---

## What Fastlane Actually Calls

For transparency — here is the raw API flow Fastlane executes on your behalf.

### Play Store upload flow

```
1. POST /auth/token  (OAuth2 JWT assertion)
   → access_token

2. POST /androidpublisher/v3/applications/{pkg}/edits
   → editId  (like a database transaction)

3. POST /androidpublisher/v3/applications/{pkg}/edits/{editId}/bundles
   (upload AAB as multipart/form-data)
   → versionCode

4. PUT /androidpublisher/v3/applications/{pkg}/edits/{editId}/tracks/{track}
   → assign versionCode to track with rollout fraction

5. POST /androidpublisher/v3/applications/{pkg}/edits/{editId}:commit
   → edit goes live (equivalent to "save and submit")
```

### App Store Connect upload flow

```
1. Generate JWT from .p8 private key (expires in 20 min)

2. POST /v1/apps/{appId}/appStoreVersions  (create new version record)

3. POST /v1/builds  (Transporter-based upload — uses Apple's binary protocol, not REST)
   Note: the actual .ipa upload uses Apple's Transporter tool or its REST equivalent
   Fastlane uses `xcrun altool` (Xcode ≤14) or `xcrun notarytool` + direct REST (Xcode 15+)

4. PATCH /v1/builds/{buildId}  (attach build to version, set release notes)

5. POST /v1/appStoreVersionSubmissions  (submit for review)
   → status: WAITING_FOR_REVIEW → IN_REVIEW → APPROVED → READY_FOR_SALE
```

---

## Summary

| Task | Command | Time | Review? |
|------|---------|------|---------|
| Upload to internal track (Play) | `capsule publish android --track internal` | ~5 min | No |
| Upload to production (Play), staged | `capsule publish android --track production --rollout 10` | ~5 min | No (if previously approved) |
| Upload to TestFlight internal | `capsule publish ios --track testflight` | ~15 min processing | No |
| Submit to App Store | `capsule publish ios --track production` | 24–48 hrs | Yes |
| Push JS update to all devices | `capsule codesync publish` | ~30 sec | No |
