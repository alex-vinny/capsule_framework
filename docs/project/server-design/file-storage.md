---
title: "Server design: file storage"
audience: maintainer
status: planned
---
# CodeSync Server — File Storage

> Content-addressed bundle storage for the CodeSync backend. Covers storage architecture, MinIO/S3 setup, CDN, and the differential download protocol.

---

## Storage Model

CodeSync uses **content-addressed storage** — every file is stored by its SHA-256 hash, never by name. This is the same model used by Git and npm's package cache.

### Why content-addressed

A typical Vite build produces 15–40 files with content-hashed names (`main-a1b2c3.js`). Between releases, only 1–3 files change. Content-addressed storage means:

- **Unchanged files are stored once** — `vendor-react-3f8d2a.js` from v1.0 and v1.1 is the same hash → same single object in storage
- **Differential downloads are automatic** — device sends its file cache (`{ filename: sha256 }`), server finds missing hashes, returns only those
- **No deduplication logic needed** — the hash IS the identity

### What is stored

```
/bundles/
  {sha256}/           ← one directory per unique file hash
    content           ← raw file bytes (compressed at rest by S3/MinIO)
```

No folder structure beyond the hash. No filenames. No version directories.

---

## Storage Backend

### Self-hosted: MinIO

MinIO is S3-compatible and ships in `docker-compose.yml`. Zero config for local development.

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio:RELEASE.2024-11-07T00-52-20Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER:     minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Web console (minioadmin/minioadmin)
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s

volumes:
  minio_data:
```

Bucket provisioning (runs on first start):
```bash
# packages/codesync-api/scripts/setup-minio.sh
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb --ignore-existing local/capsule-bundles
mc anonymous set none local/capsule-bundles    # private — all access via signed URLs
```

### Cloud: S3 / R2 / GCS

Same S3 API — just change the endpoint and credentials:

```bash
# AWS S3
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_BUCKET=capsule-bundles-prod
STORAGE_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_REGION=us-east-1

# Cloudflare R2 (recommended — free egress)
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=capsule-bundles-prod
STORAGE_ACCESS_KEY=<r2-access-key-id>
STORAGE_SECRET_KEY=<r2-secret>
STORAGE_REGION=auto
```

---

## Storage Client

```typescript
// packages/codesync-api/src/storage/client.ts
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3 = new S3Client({
  endpoint:        process.env.STORAGE_ENDPOINT,
  region:          process.env.STORAGE_REGION ?? 'auto',
  credentials: {
    accessKeyId:     process.env.STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.STORAGE_SECRET_KEY!,
  },
  forcePathStyle: true,   // required for MinIO + most non-AWS S3
})

const BUCKET = process.env.STORAGE_BUCKET!

export async function fileExists(sha256: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey(sha256) }))
    return true
  } catch {
    return false
  }
}

export async function putFile(sha256: string, body: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         objectKey(sha256),
    Body:        body,
    ContentType: 'application/octet-stream',
    // Immutable — content hash never changes
    CacheControl: 'public, max-age=31536000, immutable',
  }))
}

export async function signedDownloadUrl(sha256: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey(sha256) })
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
}

// Object key: first 2 chars as prefix prevents hot partition on large buckets
function objectKey(sha256: string): string {
  return `bundles/${sha256.slice(0, 2)}/${sha256}`
}
```

---

## Bundle Upload Flow

When `capsule codesync publish` uploads a bundle:

```
CLI: POST /v1/bundles/upload  (multipart/form-data: bundle.zip)

Server:
  1. Authenticate API key → resolve org + app + channel
  2. Parse multipart stream → buffer bundle.zip
  3. Compute SHA-256 of bundle.zip
  4. Check db.bundles WHERE zip_hash = $hash → reject duplicate
  5. Enqueue 'process-bundle' job → respond 202 Accepted { bundleId, status: 'pending' }
```

Processing happens asynchronously in a worker (see [workers.md](workers.md)):

```
Worker: process-bundle job
  1. Fetch bundle.zip bytes from queue payload
  2. Extract ZIP in-memory (no disk writes)
  3. For each file in ZIP:
     a. Compute SHA-256
     b. Check if object exists in S3 (HeadObject)  ← skip upload if already stored
     c. If missing: PUT to S3 by hash
     d. Upsert into db.bundle_files { sha256, size_bytes }
  4. Build file_manifest: { "assets/main-abc.js": "sha256:...", ... }
  5. PUT bundle.zip itself to S3 (for full-bundle fallback)
  6. UPDATE db.bundles SET status='active', file_manifest=$manifest, activated_at=now()
  7. Archive previous active bundle (UPDATE status='archived')
```

---

## Device Download Protocol

### Update check request (device → server)

```
GET /v1/check/{appId}/{channel}/{shellVersion}/{appVersion}
Authorization: Bearer <api-key>  (or anonymous with app public token)

Body (JSON) — NOT in headers (headers break CDN caching):
{
  "deviceId": "<uuid>",
  "currentBundleHash": "sha256:abc123...",
  "fileCache": {
    "index.html":             "sha256:aaa...",
    "assets/main-abc123.js":  "sha256:bbb..."
  }
}
```

> **Note**: Device-specific data (deviceId, fileCache) is in the POST body. Path segments (appId, channel, shellVersion, appVersion) are shared across devices → CDN can cache the response for devices on the same version.

### Update check response (server → device)

**No update:**
```json
{ "status": "no_update" }
```

**Update available:**
```json
{
  "status": "update_available",
  "mandatory": false,
  "bundle": {
    "version": "1.4.3",
    "buildNumber": 48,
    "zipHash": "sha256:xyz789...",
    "files": [
      {
        "path": "assets/main-def456.js",
        "sha256": "sha256:new111...",
        "size": 45200,
        "url": "https://cdn.capsule.dev/bundles/ne/new111...?sig=..."
      }
      // index.html and vendor-react.js NOT included — device already has them
    ],
    "totalBytes": 45200   // only the delta
  }
}
```

The device downloads only the listed files, patches its local cache, and marks the bundle as current.

### Full bundle fallback

If `fileCache` is empty (first install, corrupted cache), or if the diff would be > 80% of the full bundle size, the server returns a single signed URL for the full `bundle.zip` instead of individual files:

```json
{
  "status": "update_available",
  "bundle": {
    "fullBundleUrl": "https://cdn.capsule.dev/bundles/xy/xyz789...zip?sig=...",
    "fullBundleSize": 380000
  }
}
```

---

## CDN Layer

Signed URLs expire in 5 minutes. For high-traffic production deployments, serve files via CDN:

**Cloudflare R2 + Cloudflare Workers** (recommended for self-hosted):
- Store files in R2 (free egress from R2 to Cloudflare network)
- Worker validates the request signature, forwards to R2
- Global edge — no origin egress cost

**AWS S3 + CloudFront**:
- Pre-sign URLs with 5-minute TTL
- CloudFront caches by URL — since content-hash is in the key, cached forever
- Set `Cache-Control: public, max-age=31536000, immutable` on S3 objects

**MinIO (self-hosted, no CDN)**:
- 5-minute signed URL directly from MinIO
- Fine for internal/enterprise deployments with devices on the same network

---

## Storage Lifecycle

### Retention rules

| Object | Retention | When deleted |
|--------|-----------|--------------|
| Individual bundle files (`bundles/{prefix}/{sha256}`) | Until no bundle references them | Cleanup worker (weekly) |
| Full bundle ZIPs | 365 days after `archived_at` | Cleanup worker (monthly) |
| Orphaned objects (failed uploads) | 7 days | S3 lifecycle rule |

### S3 lifecycle rule (orphan cleanup)

```json
{
  "Rules": [{
    "ID": "delete-orphan-uploads",
    "Status": "Enabled",
    "Filter": { "Prefix": "bundles/staging/" },
    "Expiration": { "Days": 7 }
  }]
}
```

The S3 lifecycle rule only applies to `bundles/staging/` — the temporary prefix used during bundle upload before processing. If a bundle upload fails or is abandoned, the staging object is automatically cleaned up after 7 days.

**Active bundle files** (`bundles/{prefix}/{sha256}`) are never touched by the S3 lifecycle rule. They are only deleted by the `cleanup-orphaned-files` worker job, which checks the database before deleting anything.

### Cleanup worker logic

See [workers.md](workers.md) for the `cleanup-orphaned-files` job implementation.

---

## Bucket Configuration

```bash
# Capsule Cloud / production setup

# Create buckets
aws s3 mb s3://capsule-bundles-prod --region us-east-1

# Block all public access (all access via signed URLs)
aws s3api put-public-access-block \
  --bucket capsule-bundles-prod \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable versioning (protects against accidental deletes)
aws s3api put-bucket-versioning \
  --bucket capsule-bundles-prod \
  --versioning-configuration Status=Enabled

# Server-side encryption
aws s3api put-bucket-encryption \
  --bucket capsule-bundles-prod \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

---

## Environment Variables Reference

```bash
# Storage
STORAGE_ENDPOINT=http://minio:9000           # MinIO (local) or S3 endpoint
STORAGE_BUCKET=capsule-bundles               # bucket name
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_REGION=us-east-1                     # 'auto' for R2
STORAGE_PATH_STYLE=true                      # true for MinIO, false for AWS S3

# CDN (optional — if set, signed URLs use this base instead of STORAGE_ENDPOINT)
CDN_BASE_URL=https://cdn.capsule.dev

# URL signing
SIGNED_URL_EXPIRY_SECONDS=300               # 5 minutes default
```
