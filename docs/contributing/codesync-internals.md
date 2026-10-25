---
title: "CodeSync internals"
audience: contributor
status: current
code:
  - packages/codesync-api/src/**
  - packages/codesync-api/api-spec.yaml
  - packages/cli/src/commands/codesync.ts
  - packages/cli/src/lib/zip.ts
  - packages/core/src/codesync.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/codesync/**
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/CrashLoopGuard.kt
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/*BundleStore.kt
  - packages/capsule-ios/Sources/dev/capsule/codesync/**
tests:
  - packages/codesync-api/tests/**
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/codesync/**
  - packages/capsule-ios/Tests/CapsuleTests/codesync/**
  - packages/core/src/__tests__/codesync.test.ts
  - packages/cli/src/__tests__/zip.test.ts
---
# CodeSync internals

> How over-the-air (OTA) updates work under the hood: the bundle format, the publish flow, the
> self-hosted server, the wire protocol and the on-device client. For using CodeSync in an app,
> read [ota-updates.md](../guide/ota-updates.md) first.

> **OTA hub.** The topic spans several docs; this one owns the mechanism.
> - Why the bundle can be replaced at all (embedded runtime) → [0001-embedded-runtime.md](../decisions/0001-embedded-runtime.md)
> - App developer how-to → [ota-updates.md](../guide/ota-updates.md)
> - Cloud control plane (portal, database, workers) → [server-design/overview.md](../project/server-design/overview.md), [server-design/database.md](../project/server-design/database.md) *(Phase 6)*
> - Bundle storage (content-addressed, differential) → [server-design/file-storage.md](../project/server-design/file-storage.md)
> - Store release plus OTA, the two release layers → [publishing.md](../guide/publishing.md)
> - Bandwidth economics → [infrastructure.md](../project/infrastructure.md)
> - Store policy, capability gating, liability → [ota-policy-and-liability.md](../project/business/ota-policy-and-liability.md)
> - OTA cloud as the funding engine → [business-model.md](../project/business/business-model.md)
> - Status and sequencing (on-device done; delivery and cloud in Phase 6) → [roadmap.md](../project/roadmap.md)

---

## Status at a glance

CodeSync is the Capsule equivalent of Microsoft CodePush (retired) and Expo Updates. It is built in
layers, and each layer below is tested on its own. The parts are **not connected end to end yet**
(see [Known gaps](#known-gaps)).

| Layer | Code | State |
|---|---|---|
| Config block | `packages/cli/src/config.ts` (`codeSync`) | Built. Only `enabled`, `url`, `apiKey` are read. |
| Publish CLI | `packages/cli/src/commands/codesync.ts` | Built: `capsule codesync publish [--channel] [--notes]`. |
| Self-hosted server | `packages/codesync-api/src/index.ts`, `api-spec.yaml` | Built: single-process, file-based, one shared API key. AGPL-3.0. |
| Android client | `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/codesync/`, `runtime/FileBundleStore.kt`, `runtime/CrashLoopGuard.kt` | Built and unit-tested on the JVM. |
| iOS client | `packages/capsule-ios/Sources/dev/capsule/codesync/`, `runtime/` | Client core built and tested on Linux (`swift test`); constructed in `CapsuleViewController` but not on the bridge yet (Phase 4). |
| JS module | `packages/core/src/codesync.ts` | Built: `checkForUpdate`, `getStatus`, `applyUpdate`. |
| Cloud control plane, dashboard, staged rollout CLI, targeting, differential updates, signing | — | Planned, see [Planned: cloud control plane](#planned-cloud-control-plane-design). |

**What can be updated:** the whole web bundle (`www/`) and the QuickJS route bundle
(`server/bundle.js`), always together as one ZIP. **What cannot:** the native shell, permissions,
plugins. Those need a store release.

The update client ships in the Capsule AAR (and the Swift package) whether or not an app uses it.
When the shell config has no `codeSync`, no `codesync.*` bridge handlers are registered, so the
feature is absent from the bridge surface. It is not compiled out.

---

## Bundle ZIP format

```
bundle.zip
  www/                         ← client bundle (Vite / ng build output)
    index.html                 ← required: the shell rejects a bundle without it
    assets/…
  server/                      ← only when the app has src/server/routes/
    bundle.js                  ← esbuild output: the QuickJS route bundle
  capsule-bundle.json          ← bundle manifest
```

`capsule-bundle.json`, written by the CLI from `capsule.config.ts`:

```json
{
  "version": "1.4.2",
  "buildNumber": 47,
  "createdAt": "2025-10-15T14:32:00Z",
  "capsuleSchemaVersion": 1
}
```

The manifest is for Capsule only; the stores never see it. `capsuleSchemaVersion` lets the format
change later without breaking older clients. The device client today validates a bundle by the
presence of `www/index.html`; it does not read the manifest yet.

The ZIP is written in-process with `archiver` (DEFLATE, level 9) by `packages/cli/src/lib/zip.ts`,
so publishing behaves the same on Windows, macOS and Linux.

The whole `dist/` folder is copied into `www/`. **Planned, not built:** stripping source maps
(`--source-maps` to keep them) and a `.capsuleignore` file.

---

## Publish flow

`capsule codesync publish` (`packages/cli/src/commands/codesync.ts`):

1. Requires `codeSync.enabled`, `codeSync.url` and `codeSync.apiKey`; exits with an error otherwise.
2. Builds the web app: `web.buildCommand` when set, else `pnpm exec vite build`. Output is `dist/`.
3. When `src/server/routes/` exists, bundles the routes with esbuild into `server/bundle.js`. The
   bundle registers JSON-RPC overrides from `src/routes/*.ts` and HTTP routes from
   `src/server/routes/**/*.ts`, the same scheme `capsule build` uses.
4. Assembles `www/`, `server/` and `capsule-bundle.json` in a unique OS temp directory, which is
   removed in a `finally` block.
5. Zips it and computes its SHA-256.
6. POSTs `multipart/form-data` to `<codeSync.url>/publish` with `bundle`, `version`,
   `buildNumber`, `channel` (from `--channel`, default `production`) and optional `notes`, and an
   `Authorization: Bearer <apiKey>` header.

---

## Self-hosted server

`@capsule/codesync-api` (`packages/codesync-api/`) is the minimal self-hostable delivery server:
Fastify 5 (multipart uploads via @fastify/multipart 10), one process, a JSON manifest on disk. The contract is
[`api-spec.yaml`](https://github.com/alex-vinny/capsule_framework/blob/main/packages/codesync-api/api-spec.yaml) (OpenAPI 3).

| Endpoint | Auth | Does |
|---|---|---|
| `GET /health` | — | Liveness: `{ status, timestamp }`. |
| `GET /bundles/:version[?channel=]` | — | Returns a stored bundle; `latest` resolves the channel's current version. Sends an `ETag` (SHA-256). |
| `GET /manifest[?channel=]` | — | The current version per channel. |
| `GET /releases[?channel=]` | — | Release history, newest first. |
| `POST /publish` | `x-api-key` | Stores an uploaded bundle (multipart: `bundle`, `version`, `buildNumber`, `channel`, `notes`). 409 if the version exists. |
| `POST /rollback` | `x-api-key` | Points a channel back at its previous release. |
| `POST /pause`, `POST /resume` | `x-api-key` | Sets or clears a channel's `paused` flag. |
| `GET /devices` | `x-api-key` | Stub, returns 204. |

- **Auth:** one shared key, `CODESYNC_API_KEY`, compared with the `x-api-key` header.
- **Storage:** `storage/` next to the package, or `CODESYNC_STORAGE_DIR`. It holds `manifest.json`
  and `bundles/<version>.js` (the uploaded file is stored under that name whatever it contains).
- **Limits:** uploads up to 10 MB. Listens on `0.0.0.0:3000`.
- **Tests:** `packages/codesync-api/tests/smoke.test.ts` drives the routes with `server.inject()`.

**License.** `packages/codesync-api` is AGPL-3.0; the rest of Capsule is Apache-2.0 (see the
repository `NOTICE`). Anyone may run and modify the server. If you offer a modified version to
others over a network, you must publish your changes under the same license.

---

## Device client

The update check runs in the native layer, not in JS, so it still works when the web bundle is
broken. Android is described here; the iOS client mirrors it type for type
(`CodeSyncManager.swift`, `CodeSyncModels.swift`, `Rollout.swift`, `FileBundleStore.swift`).

### Opt-in

`CapsuleShellConfig.codeSync` (`CodeSyncConfig`: `url`, `appId`, `channel`, `nativeVersion`). When it
is set, `CapsuleActivity` builds a `CodeSyncManager` and registers the three `codesync.*` handlers
(`codesync/CodeSyncHandlers.kt`). When it is `null`, neither exists.

### Update check endpoint

```
GET {url}/v1/check/{appId}/{channel}/{nativeVersion}
```

The URL carries everything that varies, so a CDN can cache one response for every device on the
same app, channel and native version. Device identity is deliberately kept out of this request:
custom headers such as a device id would make every request unique and destroy the cache hit rate.

Response (the shape `CodeSyncModels.kt` and `CodeSyncModels.swift` decode; this exact example is
pinned by `CodeSyncModelsTest`):

```json
{
  "latestBuildNumber": 47,
  "bundle": {
    "id": "6f1c2a7e-0b4d-4c1a-9e2f-3a5b6c7d8e9f",
    "version": "1.4.2",
    "buildNumber": 47,
    "rolloutPercent": 100,
    "url": "https://cdn.capsule.dev/bundles/6f1c2a7e.zip",
    "hash": "sha256:abc123def456",
    "sizeBytes": 284000,
    "mandatory": false
  }
}
```

`rolloutPercent` defaults to 100 and `mandatory` to `false` when absent. The `sha256:` prefix on
`hash` is optional.

### Rollout decision

Gradual rollout is decided on the device, with no extra round trip (`codesync/Rollout.kt`):
MurmurHash3 x86 32-bit over the **UTF-8 bytes** of the device id, seed 0, bucketed by the
**unsigned** hash modulo 100. The device is in the rollout when `bucket < rolloutPercent`.

Any server-side implementation must compute the same bucket, i.e. `murmurhash3js-revisited`
`x86.hash32(bytes, 0)`. The repo has no TypeScript implementation yet; the vectors in Kotlin's
`RolloutTest` and Swift's `Murmur3Tests` were generated with that library and pin the contract.
The trap is the sign: Kotlin's `Int` is signed, and `Math.abs(hash) % 100` puts roughly half of
all ids in the wrong bucket. The device id is a random UUID created on first use and kept
in `SharedPreferences` (`PrefsCodeSyncStore`).

### Download and install

When the device is in the rollout and `bundle.buildNumber` is higher than the installed build
(`CodeSyncManager.checkForUpdate`):

1. Download the ZIP from `bundle.url`.
2. Compute its SHA-256 and compare it with `bundle.hash`. On mismatch, delete it and report an error.
3. Unzip into `filesDir/bundles/<bundle.id>/` (`CodeSyncUnzipper`).
4. Reject the bundle if `www/index.html` is missing.
5. Install it with `BundleStore.install`.

Every failure returns `UpdateResult.Error` and cleans up the staged directory; the manager never
throws. After the check, the manager posts a fire-and-forget check-in (failures ignored):

```
POST {url}/v1/devices/checkin
{ "deviceId", "appId", "platform": "android", "nativeVersion", "bundleId", "channel" }
```

### Bundle store

`FileBundleStore` keeps two slots under `filesDir/bundles/`:

```
active/     ← the bundle to serve
previous/   ← the last known-good bundle, the rollback target
```

`install()` demotes a valid `active/` to `previous/`, then moves the staged bundle to `active/`.
Each `File.renameTo` is atomic, with a recursive-copy fallback across filesystems. A directory
counts as a bundle only if it contains `www/index.html`, so a broken bundle is never promoted to
the rollback slot. The interface uses `String` paths so the same contract exists on iOS.

### Crash-loop rollback

`CrashLoopGuard` (`runtime/CrashLoopGuard.kt`) records a timestamp for each launch. The record is
cleared when the WebView reports the page finished loading (`CapsuleRuntime.notifyAppReady`). At
the start of each launch, `CapsuleRuntime.start()` checks: if **3** unconfirmed launches fall inside
the last **60 s** and a previous bundle exists, it calls `BundleStore.rollback()`, clears the guard
and calls `onRollback()`. The guard's clock and log are injected, so it is tested on the plain JVM.

### Bridge surface

| Method | Returns |
|---|---|
| `codesync.checkForUpdate` | `{ status, update? }`: runs a check, `status` is `"download ready"` when a bundle was installed |
| `codesync.getStatus` | `{ status }`: the manager's last status |
| `codesync.applyUpdate` | `{ status }`: `"update applied"` when an update is pending, else `"idle"` |

Status strings must match the JS `CodeSyncStatus` union exactly, spaces included (`"download
ready"`). `@capsule/core`'s `CodeSyncModule` maps them: `checkForUpdate()` returns the `update`
object only for `"download ready"`.

---

## Known gaps

What still blocks an end-to-end update, found by reading the code on 2026-10-24. Each item names
the code to change.

1. **No server speaks the device protocol.** Devices call `GET /v1/check/…` and
   `POST /v1/devices/checkin`; `@capsule/codesync-api` serves `/manifest` and `/bundles/:version`
   instead. One side has to adopt the other's shape.
2. **CLI and server disagree on auth.** `capsule codesync publish` sends
   `Authorization: Bearer <key>`; the server reads `x-api-key`. Publishing to the bundled server
   gets 401.
3. **The server ignores the bundle checksum.** `codesync publish` sends the ZIP (`bundle`, file
   name `bundle.zip`) plus a `sha256` field, but `codesync-api` neither verifies nor stores it, so
   the manifest it serves carries no hash for the device's integrity gate.
4. **The OTA route bundle exposes the wrong global.** `codesync.ts` aliases
   `capsuleRouter.handleHttpRoute`; `build.ts` uses `capsuleRouter.handleHttpRequest`. HTTP routes
   in an OTA bundle would have no `handleHttpRequest`. Routes are also bundled only when
   `src/server/routes/` exists, which drops JSON-RPC overrides in `src/routes/` when there are no
   HTTP routes.
5. **The server stores the ZIP as `bundles/<version>.js`** and serves it as
   `application/javascript`. That is left over from an earlier JS-only design; `api-spec.yaml`
   still describes a gzipped JS bundle.
6. **Generated apps never enable OTA.** The `MainActivity` that `capsule sync` writes sets only
   `devServerUrl`. The `codeSync` block in `capsule.config.ts` is not passed into
   `CapsuleShellConfig`.
7. **An installed bundle is not served.** The embedded server reads static files from the APK
   (`AssetManagerStaticAssets`), and `QuickJSBridgeImpl` loads `server/bundle.js` from the APK too,
   not from `BundleStore.activeDir()`. A crash-loop rollback therefore swaps directories that
   nothing serves.
8. **One crash can trigger a rollback.** `CapsuleActivity` and `CapsuleRuntime.start()` both call
   `recordLaunchAttempt()`, so each launch adds two records and the 3-in-60-s threshold is reached
   after the first crashing launch.
9. **`applyUpdateOnNextResume`** loads `file://<path>/index.html` — not `www/index.html`, and not
   through the loopback server.
10. **Config fields with no effect:** `codeSync.channel`, `strategy`, `checkOnForeground`,
    `mandatory`. `publish` takes the channel from `--channel` only.
11. **iOS** constructs its `CodeSyncManager` but does not register bridge handlers yet (Phase 4).

---

## Planned: cloud control plane (design)

Everything below is **design, not built**. It describes the managed, multi-tenant service
(Phase 6) that the self-hosted server is a small subset of. Where it and the built code differ,
the built sections above win.

### Prior Art Analysis

| Project | Status | Key Lesson |
|---------|--------|-----------|
| **Microsoft CodePush** (`microsoft/code-push`) | Archived 2023, merged into App Center then killed | Proved the model. Don't depend on it. |
| **Expo Updates** (`expo/expo` — `packages/expo-updates`) | Active, open source | Best-in-class architecture. Study the differential update approach. |
| **Shorebird** (`shorebirdtech/shorebird`) | Active, commercial | Dart/Flutter-specific but excellent rollout/rollback UX |
| **hot-updater** (`gronxb/hot-updater`) | Active GitHub project | Self-hosted, React Native, clean architecture reference |
| **AppFlow** (Ionic) | Commercial SaaS | Reference for enterprise feature set |

**Recommendation**: Model the protocol and update flow after **Expo Updates** (open source, battle-tested at scale) but implement self-hosted from day one. Do not depend on third-party SaaS.

---

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Machine                         │
│  capsule codesync publish --channel production              │
│       → packages dist/ → uploads bundle to API             │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTPS (multipart upload)
┌───────────────────▼─────────────────────────────────────────┐
│              CodeSync Backend (Node.js / TypeScript)         │
│                                                              │
│  POST /api/bundles/upload                                    │
│  GET  /api/bundles/check    ← device checks for updates      │
│  GET  /api/bundles/:id/download                              │
│  POST /api/devices/checkin  ← device telemetry               │
│                                                              │
│  ┌─────────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │  PostgreSQL  │   │  Redis (cache)   │   │ Object Store │  │
│  │  (devices,  │   │  (hot version    │   │ (S3/R2/Minio)│  │
│  │  releases,  │   │  lookup cache)   │   │ bundle ZIPs  │  │
│  │  telemetry) │   └──────────────────┘   └──────────────┘  │
│  └─────────────┘                                             │
└─────────────────────────────────────────────────────────────┘
                    │ CDN (CloudFront / Cloudflare R2)
┌───────────────────▼─────────────────────────────────────────┐
│                   Installed Apps (Devices)                   │
│                                                              │
│  Capsule runtime checks on app foreground                    │
│  Downloads + applies update in background                    │
│  Restarts web layer on next app resume                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              CodeSync Dashboard (React)                      │
│  - Release management    - Device fleet view                 │
│  - Rollout controls      - OS/version breakdown              │
│  - Rollback              - Error rate monitoring             │
└─────────────────────────────────────────────────────────────┘
```

---

### Database Schema

Designed for millions of devices with proper partitioning strategy.

```sql
-- ============================================================
-- USERS (dashboard accounts / API key owners)
-- ============================================================
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- APPS
-- ============================================================
CREATE TABLE apps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       TEXT NOT NULL UNIQUE,        -- 'com.yourcompany.app'
  name         TEXT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CHANNELS
-- Deployment targets: production, staging, beta, etc.
-- ============================================================
CREATE TABLE channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       UUID NOT NULL REFERENCES apps(id),
  name         TEXT NOT NULL,              -- 'production', 'staging'
  UNIQUE(app_id, name)
);

-- ============================================================
-- BUNDLES
-- One row per published web bundle
-- ============================================================
CREATE TABLE bundles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES apps(id),
  channel_id        UUID NOT NULL REFERENCES channels(id),
  version           TEXT NOT NULL,          -- semver: '1.4.2'
  build_number      BIGINT NOT NULL,        -- monotonic, used for ordering
  storage_key       TEXT NOT NULL,          -- S3/R2 object key
  storage_url       TEXT NOT NULL,          -- CDN URL
  size_bytes        BIGINT NOT NULL,
  hash_sha256       TEXT NOT NULL,          -- integrity verification
  min_native_version TEXT,                  -- npm semver range e.g. '>=1.4.0' (see ../reference/lockfile.md)
  max_native_version TEXT,                  -- npm semver range e.g. '<2.0.0' (optional upper bound)
  metadata          JSONB DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'active',
                    -- active | paused | rolled_back | archived
  rollout_percent   SMALLINT NOT NULL DEFAULT 100,  -- 0-100
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id),

  CONSTRAINT build_number_monotonic UNIQUE (app_id, channel_id, build_number)
);

CREATE INDEX idx_bundles_channel_status ON bundles(channel_id, status, build_number DESC);

-- ============================================================
-- DEVICES
-- One row per installed app instance
-- Partitioned by app_id for scale
-- ============================================================
CREATE TABLE devices (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  app_id              UUID NOT NULL REFERENCES apps(id),
  device_id           TEXT NOT NULL,           -- UUID generated on first launch, stored in keychain/keystore
  platform            TEXT NOT NULL,           -- 'android' | 'ios'
  platform_version    TEXT NOT NULL,           -- '14', '17.2', etc.
  native_version      TEXT NOT NULL,           -- capsule shell version: '1.4.0'
  app_version         TEXT NOT NULL,           -- store app version: '2.1.0'
  bundle_id           UUID REFERENCES bundles(id),   -- currently running bundle
  channel             TEXT NOT NULL DEFAULT 'production',
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  timezone            TEXT,
  locale              TEXT,
  device_model        TEXT,                    -- 'Pixel 8', 'iPhone 15'
  metadata            JSONB DEFAULT '{}',

  PRIMARY KEY (app_id, device_id)             -- compound PK for partitioning
) PARTITION BY HASH (app_id);                 -- hash-partition by app

-- Create 16 partitions (adjust as scale grows)
CREATE TABLE devices_p0  PARTITION OF devices FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE devices_p1  PARTITION OF devices FOR VALUES WITH (MODULUS 16, REMAINDER 1);
-- ... p2 through p15

CREATE INDEX idx_devices_last_seen   ON devices(app_id, last_seen_at DESC);
CREATE INDEX idx_devices_channel     ON devices(app_id, channel);
CREATE INDEX idx_devices_bundle      ON devices(bundle_id);
CREATE INDEX idx_devices_platform_v  ON devices(app_id, platform, platform_version);

-- ============================================================
-- DEVICE EVENTS (timeseries — partition by month)
-- Records update lifecycle: checked / downloaded / applied / error
-- ============================================================
CREATE TABLE device_events (
  id          BIGSERIAL,
  app_id      UUID NOT NULL,
  device_id   TEXT NOT NULL,
  bundle_id   UUID REFERENCES bundles(id),
  event       TEXT NOT NULL,
              -- 'check' | 'download_start' | 'download_complete'
              -- | 'apply' | 'rollback' | 'error'
  error_code  TEXT,
  metadata    JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);           -- monthly partitions

-- Auto-partition creation via pg_partman (recommended)
-- Retain 12 months of granular events, then aggregate

-- ============================================================
-- AGGREGATED METRICS (pre-computed, avoid querying device_events at scale)
-- ============================================================
CREATE TABLE bundle_stats (
  bundle_id       UUID NOT NULL REFERENCES bundles(id),
  hour            TIMESTAMPTZ NOT NULL,        -- truncated to hour
  checks          INT NOT NULL DEFAULT 0,
  downloads       INT NOT NULL DEFAULT 0,
  installs        INT NOT NULL DEFAULT 0,
  errors          INT NOT NULL DEFAULT 0,
  active_devices  INT NOT NULL DEFAULT 0,

  PRIMARY KEY (bundle_id, hour)
);
```

---

### Backend API

**Stack**: Node.js + TypeScript + Fastify (or Hono for edge). Stateless — scales horizontally behind a load balancer.

#### Check endpoint at scale

```
GET /v1/check
```

Called by every device on app foreground (potentially millions of req/min).

**Two-request design** — separates the CDN-cacheable check from the device-specific parts:

**Request 1 — Bundle check (CDN-cacheable GET):**
URL encodes the cache key so CDN can serve the same response to all devices sharing the same app/channel/native-version:
```
GET /v1/check/{appId}/{channel}/{nativeVersion}

# Example:
GET /v1/check/com.yourcompany.app/production/1.4.0
```

The response is the [check response](#update-check-endpoint) the device client already decodes. CDN-cached with a 30 s TTL, it is identical for every device on the same app, channel and native version; each device then applies the rollout decision locally ([Rollout decision](#rollout-decision)).

**Request 2 — Device check-in (background, fire-and-forget POST):**
This is where device identity, platform version, and current bundle are reported. Runs async, never blocks the UX. See Device Check-in section below.

**Caching strategy**:
- CDN caches by URL path: `{appId}/{channel}/{nativeVersion}` — same response served to all matching devices
- Redis key (origin cache): `check:{app_id}:{channel}:{native_version}` — TTL 30s
- On bundle publish: invalidate affected Redis keys → CDN TTL expires naturally within 30s

#### Device Check-in (background, fire-and-forget)

```
POST /v1/devices/checkin
```

```json
{
  "deviceId": "uuid",
  "appId": "com.yourcompany.app",
  "platform": "android",
  "platformVersion": "14",
  "nativeVersion": "1.4.0",
  "bundleId": "uuid",
  "channel": "production",
  "deviceModel": "Pixel 8",
  "metadata": {
    "user_tier": "enterprise",
    "experiment_group": "checkout-v2"
  },
  "locale": "en-US",
  "timezone": "America/New_York"
}
```

Upsert into `devices` table. Response: `202 Accepted`. Use a write queue (BullMQ / Redis queue) to absorb spikes and batch writes.

#### Bundle Upload

```
POST /v1/bundles/upload   (multipart/form-data)
Authorization: Bearer <api-key>
```

Fields:
- `bundle` — ZIP file of the built `dist/`
- `appId`
- `channel`
- `version` — `{appVersion}+{bundlePatch}` format (e.g. `1.0.0+3`). Bundle counter resets to `1` when `appVersion` changes.
- `minNativeVersion` (optional) — npm semver range e.g. `>=1.4.0`
- `rolloutPercent` (default: 100)
- `filter` (optional) — JSONB filter expression targeting device metadata: `"metadata.user_tier = 'enterprise'"`
- `scheduledAt` (optional) — ISO 8601 timestamp; bundle is ready but delivery begins at this time

Processing pipeline:
1. Validate API key → app ownership
2. Receive ZIP → stream to temp storage
3. Compute SHA-256 hash
4. Upload to S3/R2 (storage key: `bundles/{app_id}/{build_number}.zip`)
5. Insert into `bundles` table
6. Invalidate Redis cache for affected channel
7. Return bundle record

#### Rollout Control

```
PATCH /v1/bundles/:bundleId
{
  "rolloutPercent": 10,    // gradual rollout: start at 10%
  "status": "paused"       // emergency stop
}
```

**Gradual rollout**: The update check endpoint uses `rolloutPercent` with a deterministic hash of `device_id` to assign devices consistently to a cohort. Same device always gets the same answer for a given percent.

```typescript
// npm install murmurhash3js-revisited  (or any consistent hash — must match client)
import { x86 } from 'murmurhash3js-revisited'

function isInRollout(deviceId: string, percent: number): boolean {
  if (percent >= 100) return true
  if (percent <= 0) return false
  const hash = x86.hash32(deviceId) % 100   // deterministic: same device always same bucket
  return hash < percent
}
```

#### Rollback

```
POST /v1/bundles/:bundleId/rollback
```

Sets `status = 'rolled_back'` on the bundle. The previous active bundle for that channel becomes active. All devices receive the previous bundle on next check.

---

### Frontend Dashboard

**Stack**: React + TanStack Query + Recharts. Single-page app served by the backend.

#### Key Views

##### 1. Releases View
```
App: com.yourcompany.app  Channel: [production ▼]

┌─────────────────────────────────────────────────────────────────┐
│ v1.4.2  build #47   ● Active  100%    2.1M active devices       │
│ Published 2h ago by alex@company.com                            │
│ [Pause]  [Rollback]  [Adjust Rollout %]                         │
├─────────────────────────────────────────────────────────────────┤
│ v1.4.1  build #46   ◎ Previous  —     —                         │
│ Published 2d ago                                                │
├─────────────────────────────────────────────────────────────────┤
│ v1.4.0  build #45   ✗ Rolled back                               │
└─────────────────────────────────────────────────────────────────┘
```

##### 2. Device Fleet View
```
Total active devices: 2,847,392   (active = seen in last 30 days)

Platform         Devices      %
─────────────────────────────────
Android          1,923,440   67.5%
  └─ Android 14    980,000   34.4%
  └─ Android 13    612,000   21.5%
  └─ Android 12    331,440   11.6%
iOS                923,952   32.5%
  └─ iOS 17.x      601,000   21.1%
  └─ iOS 16.x      322,952   11.3%

Native Shell Version
─────────────────────────────────
v1.4.x           2,613,000   91.8%  ← current
v1.3.x             234,392    8.2%  ← upgrade pressure

Bundle Coverage
─────────────────────────────────
v1.4.2 (latest)  2,100,000   73.8%
v1.4.1            714,000    25.1%
Older              33,392     1.1%
```

##### 3. Release Detail — Update Funnel

```
Bundle v1.4.2  Last 24 hours

Checks           4,832,000  ──────────────────────────── 100%
Downloaded       2,214,000  ─────────────────           45.8%
Applied          2,100,000  ────────────────            43.5%
Errors               1,240  ▏                            0.026%

Error breakdown:
  DOWNLOAD_HASH_MISMATCH    812    (CDN issue — 3h ago, resolved)
  STORAGE_WRITE_FAILED      428    (low-disk devices)
```

##### 4. Gradual Rollout Control

```
Current rollout: 10%

[━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] 

[  10%  ] [  25%  ] [  50%  ] [  100%  ]   [Custom: ___]

Active on:   284,739 devices
Error rate:  0.02%  ✓ Healthy  → Safe to increase
```

---

### Scalability Design

#### How it handles millions of devices

**The hot path is the update check endpoint.** This must handle spikes (everyone opens the app at 9am).

| Layer | Solution |
|-------|---------|
| **Check endpoint** | Stateless, horizontally scaled behind load balancer |
| **Redis cache** | Active bundle per channel cached 30s — 99% of requests never hit the DB |
| **Database** | Read replicas for all read queries; primary only for writes |
| **Device writes** | Write queue (BullMQ) — absorbs spikes, batches upserts |
| **Bundle downloads** | Served from CDN (CloudFront/Cloudflare R2) — backend not involved |
| **Metrics** | Pre-aggregated into `bundle_stats` hourly — dashboard never queries `device_events` directly |
| **Partitioning** | `devices` table hash-partitioned by `app_id`; `device_events` range-partitioned by month |

**Capacity rough math**:
- 10M devices, check every foreground = ~50M checks/day = ~580 req/sec average
- Peak (morning rush, 10x): ~5,800 req/sec
- With 30s Redis cache: cache hit rate ~95%+, effective DB load < 300 req/sec
- 3 backend instances handle this comfortably

**Device storage**: 10M devices × ~1KB per row = ~10GB. Trivial for PostgreSQL with proper partitioning.

**Events storage**: 50M events/day × 30 days = 1.5B rows/month. Partition by month, drop after 12 months, aggregate into `bundle_stats`.

---

### Version Numbering Convention

Bundle versions follow `{appVersion}+{bundlePatch}` — semver build metadata:

```
Store release: 1.0.0   → CodeSync bundles: 1.0.0+1, 1.0.0+2, 1.0.0+3 ...
Store release: 1.1.0   → CodeSync bundles: 1.1.0+1, 1.1.0+2 ...
```

`capsule codesync publish` auto-increments the bundle counter within the current `appVersion` and resets it to `+1` when `appVersion` changes. CLI and dashboard always display as two separate columns (`VERSION` + `BUNDLE`) — the `+` notation is never surfaced directly.

---

### Device Metadata API

The shell automatically sends standard metadata at every check-in: `os_version`, `locale`, `timezone`, `device_model`, `app_version`, `bundle_version`.

For custom business metadata, the app registers it via the bridge:

```typescript
import { codesync } from '@capsule/core'

// Call after authentication — when business context is known
codesync.setDeviceMetadata({
  user_tier: user.subscriptionPlan,   // 'free' | 'pro' | 'enterprise'
  experiment_group: abTest.group,     // 'control' | 'checkout-v2'
  store_id: user.assignedStore        // for retail/franchise use cases
})
```

Metadata is stored in `devices.metadata JSONB`, merged with standard metadata. No PII — use opaque identifiers, not email or name.

**Targeting at publish time:**
```bash
# Geographic (automatic metadata — no app code needed)
capsule codesync publish --filter "metadata.locale LIKE 'pt-%'"

# Business segment (custom metadata)
capsule codesync publish --channel staging --filter "metadata.user_tier = 'enterprise'"

# Named group (saved filter expression in the dashboard)
capsule codesync publish --group "brazil-enterprise"
```

---

### Channel Promotion

Channels are the approval mechanism. `capsule codesync promote` is the approval gesture.

```bash
# Publish to staging (developers can do this)
capsule codesync publish --channel staging

# After QA sign-off — promote to production (Releaser role required)
capsule codesync promote --from staging --to production --rollout 5

# Increase rollout after monitoring
capsule codesync rollout 25
capsule codesync rollout 100
```

Role-based access in the portal: `Developer` role can publish to non-production channels. `Releaser` role required to promote to production. The audit log records who ran each `promote`.

---

### Planned CLI commands

Only `capsule codesync publish --channel --notes` exists today ([Publish flow](#publish-flow)). The rest of this list is the target surface.

```bash
# Publish a new bundle
capsule codesync publish
capsule codesync publish --channel staging
capsule codesync publish --channel production --rollout 10
capsule codesync publish --filter "metadata.user_tier = 'enterprise'"   # metadata targeting
capsule codesync publish --group "beta-testers"                          # named group
capsule codesync publish --at "2026-06-01T09:00:00Z"                    # scheduled release
capsule codesync publish --min-native-version ">=1.4.0"                 # native version gate

# Promote between channels (approval gesture)
capsule codesync promote --from staging --to production
capsule codesync promote --from staging --to production --rollout 5

# Manage releases
capsule codesync releases                    # list releases
capsule codesync rollback                    # rollback latest on current channel
capsule codesync rollback --bundle v1.4.1    # rollback to specific version
capsule codesync pause                       # emergency stop
capsule codesync rollout 50                  # increase to 50%
capsule codesync rollout 100                 # full rollout

# Device info
capsule codesync devices                     # fleet summary
capsule codesync devices --platform android  # filtered
```

---

### Deployment of the full service

```yaml
# docker-compose.yml for CodeSync service
services:
  codesync-api:
    image: ghcr.io/capsule/codesync-api:latest
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
      STORAGE_BUCKET: capsule-bundles
      STORAGE_ENDPOINT: https://...   # S3, R2, or MinIO
      API_KEY_SECRET: ...
    ports:
      - "3000:3000"
    deploy:
      replicas: 3

  codesync-dashboard:
    image: ghcr.io/capsule/codesync-dashboard:latest
    ports:
      - "8080:80"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: capsule
      POSTGRES_PASSWORD: capsule
      POSTGRES_DB: capsule
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  minio:                   # local S3-compatible storage
    image: minio/minio:RELEASE.2024-11-07T00-52-20Z
    command: server /data
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  minio-data:
```

---

### API Key Setup

CodeSync publish operations require an API key tied to your app registration in the Capsule portal (see `../project/server-design/overview.md`).

**How to get an API key:**
1. Sign up at the Capsule portal (self-hosted or cloud)
2. Create an organization and register your app with its `appId`
3. Generate an API key under **Settings → API Keys**
4. Add it to your environment:

```bash
# .env.local (never commit this file)
CODESYNC_API_KEY=csk_live_xxxxxxxxxxxxxxxxxxxx

# Or in CI secrets:
# CODESYNC_API_KEY → GitHub/GitLab/Azure secret
```

```typescript
// capsule.config.ts
codeSync: {
  url:    process.env.CODESYNC_URL,
  apiKey: process.env.CODESYNC_API_KEY,   // ← portal-generated key
  channel: 'production'
}
```

The API key is **only used by the CLI for publishing** — it is never embedded in the app binary. The app reads from the check endpoint (public, CDN-cached) and the check-in endpoint (unauthenticated, rate-limited by IP).

---

### Security Considerations

Built today: SHA-256 verification before install, and an API key that only the publish side uses. Everything else in this list is planned.

- **Bundle integrity**: SHA-256 hash verified by the native client before applying. Reject and report if mismatch.
- **HTTPS only**: All check and download endpoints require TLS. Native client pins the cert (configurable).
- **API keys**: Publish endpoint requires API key (never embedded in app). Generated in the Capsule portal. Dashboard uses JWT auth (see `../project/server-design/overview.md`).
- **Bundle signing** (future): Sign bundles with a private key; native client verifies with embedded public key. Prevents MITM even with compromised CDN.
- **No arbitrary code at capsule layer**: CodeSync can only update the web bundle (`www/`) and the server bundle (`server/bundle.js`). It cannot update native code, permissions, or the capsule shell. This is enforced by the native runtime loading only from the designated bundle directory.
- **`min_native_version`**: Uses npm semver ranges (e.g. `>=1.4.0`). Evaluated client-side using an embedded semver library that matches npm's `semver` package behavior exactly.

---

### Phased Delivery

| Phase | Deliverable |
|-------|-------------|
| **CS-1** | Backend API (check, upload, checkin) + PostgreSQL schema + S3 storage |
| **CS-2** | Android client runtime (check, download, apply) |
| **CS-3** | CLI commands (`publish`, `rollback`, `rollout`) |
| **CS-4** | Dashboard (releases, fleet view, funnel) |
| **CS-5** | iOS client runtime + gradual rollout + mandatory updates |
| **CS-6** | Differential updates — file-level content-addressed storage. CodeSync is a service pack / hotfix channel: a typical fix changes 1–3 Vite output chunks. Server stores files by content hash; devices download only what changed. Since Vite outputs content-hashed filenames, unchanged chunks are never retransferred. Expected reduction: 80–95% of full bundle size for a typical hotfix. No binary diff algorithm needed. |

---

## Appendix: iOS shell build with xtool

> This section is about building the iOS shell, not OTA. It is kept here until it moves to [ios-bring-up.md](ios-bring-up.md); the steps are unverified on real hardware.

The iOS capsule shell can now be built entirely on Linux/WSL/Windows using the **xtool** cross‑platform Xcode replacement. This eliminates the need for a macOS machine during development and CI.

### Prerequisites
1. **Install xtool** – follow the official guide: https://xtool.sh/documentation/xtooldocs/installation-linux (Linux/WSL) or the Windows equivalent.
2. **Authenticate with Apple Developer Services** – required for code signing and SDK access:
   ```bash
   xtool auth login   # opens a browser flow or prompts for credentials + 2FA
   xtool auth status  # should show you are logged in
   ```
3. **The iOS capsule package is a SwiftPM project** – manifest at the capsule repo root, `Package.swift`
   (sources stay in `packages/capsule-ios/`; deps: `swift-crypto` for bundle SHA-256,
   `ZIPFoundation` for extraction — both Apple + Linux; the embedded server builds from the vendored
   `packages/native/civetweb` as the `CCivetweb` target;
   XKit stays optional until a device-management feature needs it). The CodeSync client core is
   implemented and unit-tested on Linux (`swift test` in a `swift:6.4-jammy` container, 89 tests);
   see `packages/capsule-ios/README.md`.
   **Wire-contract note:** the rollout hash is MurmurHash3 x86 32-bit over the **UTF-8 bytes** of
   the device id (`murmurhash3js-revisited` `x86.hash32(bytes, 0)`), bucketed by the **unsigned**
   hash modulo 100 — the Swift/Kotlin/TS implementations are pinned to the same shared vectors.

### Build Steps
From the root of the capsule repo (where `Package.swift` is):

```bash
# 1. Resolve dependencies and fetch the Darwin Swift SDK
xtool sdk install iphoneos   # installs the iOS device SDK
xtool sdk install iphonesimulator # installs the iOS simulator SDK

# 2. Build the XCFramework for device and simulator
xtool build -c release --scheme Capsule \
    -destination 'generic/platform=iOS' \
    --archive-path ./build/ios-arm64.xcarchive \
    SKIP_INSTALL=NO BUILD_LIBRARIES_FOR_DISTRIBUTION=YES

xtool build -c release --scheme Capsule \
    -destination 'generic/platform=iOS Simulator' \
    --archive-path ./build/ios-simulator.xcarchive \
    SKIP_INSTALL=NO BUILD_LIBRARIES_FOR_DISTRIBUTION=YES

# 3. Create the universal XCFramework
xtool create-xcframework \
    -framework ./build/ios-arm64.xcarchive/Products/Library/Frameworks/Capsule.framework \
    -framework ./build/ios-simulator.xcarchive/Products/Library/Frameworks/Capsule.framework \
    -output ./build/Capsule.xcframework
```

### Using the Built Framework
The resulting `./build/Capsule.xcframework` can be consumed by the Capsule CLI exactly as before. Set the environment variable to point to your locally built override:

```bash
export CAPSULE_SHELL_OVERRIDE_PATH=$(pwd)/build/Capsule.xcframework
```

Then run the usual CLI commands (`capsule dev ios`, `capsule build ios`, etc.) – they will pick up the overridden shell.

### Testing the Swift Side (Optional)
Add Swift unit tests under `packages/capsule-ios/Tests/` and run them from the repo root with:

```bash
xtool test   # builds and runs tests on the host using the iOS Simulator SDK
```

or, with no Apple tooling at all, `swift test` in Docker — see `packages/capsule-ios/README.md`.

### Notes
- The build process uses `xtool build`, which is a thin wrapper around `xcodebuild` that automatically selects the correct toolchain and SDKs provided by xtool.
- All code‑signing steps (if you intend to distribute the app) are handled by `xtool codesign` under the hood; you can also invoke it manually for ad‑hoc signing.
- For CI pipelines, simply install xtool, run `xtool auth login` (store the session token securely), and execute the build steps above.

This approach keeps the iOS capsule shell lightweight, enables rapid iteration on non‑macOS workstations, and aligns the build process with the existing Android Gradle‑based workflow.
