---
title: "Server design: background workers"
audience: maintainer
status: planned
---
# CodeSync Server — Background Workers

> Async job processing for the CodeSync backend. Covers queue architecture, job types, and worker deployment.

---

## Queue Stack

**BullMQ** (Redis-backed) — chosen for:
- Persistent queues (jobs survive server restart)
- Concurrency control per queue
- Built-in retry with exponential backoff
- Job progress tracking (useful for bundle processing)
- Works with any Redis-compatible server (Redis, Valkey, Upstash)

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes   # persist queue state
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  redis_data:
```

```bash
# Environment
REDIS_URL=redis://redis:6379
```

---

## Queue Architecture

```
                    ┌──────────────────────────────────┐
                    │         codesync-api              │
                    │  (Fastify HTTP server)            │
                    └──────────┬───────────────────────┘
                               │ enqueue jobs
                               ▼
                    ┌──────────────────────────────────┐
                    │         Redis (BullMQ)            │
                    │                                   │
                    │  queue: bundle-processing         │
                    │  queue: notifications             │
                    │  queue: device-cleanup            │
                    │  queue: analytics                 │
                    └──────────┬───────────────────────┘
                               │ dequeue + process
                               ▼
                    ┌──────────────────────────────────┐
                    │         codesync-worker           │
                    │  (separate Node.js process)       │
                    └──────────────────────────────────┘
```

The worker process is a separate Node.js process from the API. In Docker Compose, it runs as a separate service using the same Docker image with a different `CMD`:

```yaml
# docker-compose.yml
services:
  codesync-api:
    image: ghcr.io/capsule/codesync-api
    command: node dist/server.js
    environment: *api-env

  codesync-worker:
    image: ghcr.io/capsule/codesync-api    # same image, different entrypoint
    command: node dist/worker.js
    environment: *api-env
    deploy:
      replicas: 2                  # scale workers independently
```

---

## Worker Entry Point

```typescript
// packages/codesync-api/src/worker.ts
import { Worker } from 'bullmq'
import { connection } from './queue/connection.js'
import { processBundleJob } from './jobs/process-bundle.js'
import { sendNotificationsJob } from './jobs/send-notifications.js'
import { cleanupDevicesJob } from './jobs/cleanup-devices.js'
import { cleanupOrphanedFilesJob } from './jobs/cleanup-orphaned-files.js'
import { aggregateAnalyticsJob } from './jobs/aggregate-analytics.js'

const workers = [
  new Worker('bundle-processing', processBundleJob, {
    connection,
    concurrency: 4,             // process 4 bundles simultaneously
    limiter: { max: 10, duration: 60_000 },  // max 10 per minute
  }),
  new Worker('notifications', sendNotificationsJob, {
    connection,
    concurrency: 20,
  }),
  new Worker('device-cleanup', cleanupDevicesJob, {
    connection,
    concurrency: 1,             // runs on schedule, no concurrency needed
  }),
  new Worker('analytics', aggregateAnalyticsJob, {
    connection,
    concurrency: 2,
  }),
]

// Graceful shutdown
process.on('SIGTERM', async () => {
  await Promise.all(workers.map(w => w.close()))
  process.exit(0)
})

console.log('[worker] Started — listening on all queues')
```

---

## Queue Connection

```typescript
// packages/codesync-api/src/queue/connection.ts
import { Redis } from 'ioredis'

export const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,   // required by BullMQ
  enableReadyCheck: false,
})
```

---

## Jobs

### `process-bundle` — Bundle Processing

Triggered by: `POST /v1/bundles/upload` (immediately after receiving the ZIP)

```typescript
// packages/codesync-api/src/jobs/process-bundle.ts
import { Job } from 'bullmq'
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { s3, putFile, fileExists } from '../storage/client.js'
import { db } from '../db/knex.js'

interface ProcessBundlePayload {
  bundleId:  string
  zipBuffer: Buffer   // the raw bundle.zip bytes
  appId:     string
  channelId: string
}

export async function processBundleJob(job: Job<ProcessBundlePayload>) {
  const { bundleId, zipBuffer, appId, channelId } = job.data

  await job.updateProgress(5)

  // 1. Parse ZIP
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries().filter(e => !e.isDirectory)

  await job.updateProgress(15)

  // 2. Process each file — store by content hash
  const fileManifest: Record<string, string> = {}
  let processed = 0

  for (const entry of entries) {
    const content = entry.getData()
    const sha256  = 'sha256:' + createHash('sha256').update(content).digest('hex')
    const path    = entry.entryName

    fileManifest[path] = sha256

    // Upsert file record
    await db('bundle_files')
      .insert({ sha256, size_bytes: content.length, first_seen_at: new Date(), last_seen_at: new Date() })
      .onConflict('sha256')
      .merge({ last_seen_at: new Date() })

    // Only upload to storage if not already there (dedup)
    if (!(await fileExists(sha256.replace('sha256:', '')))) {
      await putFile(sha256.replace('sha256:', ''), content)
    }

    processed++
    await job.updateProgress(15 + Math.floor((processed / entries.length) * 70))
  }

  // 3. Store the full ZIP itself (for full-bundle fallback)
  const zipHash = createHash('sha256').update(zipBuffer).digest('hex')
  await putFile(zipHash, zipBuffer)

  await job.updateProgress(90)

  // 4. Mark bundle active, archive previous
  await db.transaction(async (trx) => {
    // Archive previous active bundle
    await trx('bundles')
      .where({ app_id: appId, channel_id: channelId, status: 'active' })
      .update({ status: 'archived', archived_at: new Date() })

    // Activate this bundle
    await trx('bundles')
      .where({ id: bundleId })
      .update({
        status:       'active',
        file_manifest: JSON.stringify(fileManifest),
        activated_at:  new Date(),
      })
  })

  await job.updateProgress(100)

  return { bundleId, fileCount: entries.length }
}
```

**Error handling**: If processing fails, `status` is set to `'failed'` with `processing_error = err.message`. BullMQ retries 3 times with exponential backoff before marking the job as failed.

---

### `send-notifications` — Push Notification Dispatch

Triggered by: CodeSync dashboard when a mandatory update is published, or by a scheduled job checking for devices still on old bundles.

> The native push capability (FCM/APNs) is Phase 3 (Native APIs Expansion); server-side dispatch through this worker ships with the OTA cloud in Phase 6. Initial MVP: this job logs which devices need notification — actual push delivery is a Phase 6 addition.

```typescript
// packages/codesync-api/src/jobs/send-notifications.ts
import { Job } from 'bullmq'
import { db } from '../db/knex.js'

interface SendNotificationsPayload {
  bundleId:  string
  appId:     string
  mandatory: boolean
}

export async function sendNotificationsJob(job: Job<SendNotificationsPayload>) {
  const { bundleId, appId, mandatory } = job.data

  if (!mandatory) return  // only push for mandatory updates initially

  // Find devices still on old bundles
  const staleDevices = await db('devices')
    .where({ app_id: appId })
    .whereNot({ current_bundle_id: bundleId })
    .select('device_id', 'platform')

  // Phase 6: send FCM/APNs push to each device
  // MVP: just log
  console.log(`[notifications] ${staleDevices.length} devices need mandatory update ${bundleId}`)

  return { notified: staleDevices.length }
}
```

---

### `cleanup-devices` — Stale Device Cleanup

Triggered by: Scheduled cron job (daily at 03:00 UTC)

```typescript
// packages/codesync-api/src/jobs/cleanup-devices.ts
import { Job } from 'bullmq'
import { db } from '../db/knex.js'

const STALE_DEVICE_DAYS = 180

export async function cleanupDevicesJob(_job: Job) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - STALE_DEVICE_DAYS)

  const { rowCount } = await db.raw(
    `DELETE FROM devices WHERE last_seen_at < ? RETURNING id`,
    [cutoff]
  )

  console.log(`[cleanup] Removed ${rowCount} stale devices (last seen > ${STALE_DEVICE_DAYS} days ago)`)
  return { removed: rowCount }
}
```

---

### `cleanup-orphaned-files` — Storage Cleanup

Triggered by: Weekly scheduled job. Removes objects from S3/MinIO that are no longer referenced by any bundle.

```typescript
// packages/codesync-api/src/jobs/cleanup-orphaned-files.ts
import { Job } from 'bullmq'
import { db } from '../db/knex.js'
import { s3 } from '../storage/client.js'
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

const BUCKET = process.env.STORAGE_BUCKET!

export async function cleanupOrphanedFilesJob(_job: Job) {
  // Get all SHA-256 hashes referenced by active/archived bundles
  const referencedHashes = new Set<string>()

  const bundles = await db('bundles')
    .whereIn('status', ['active', 'archived'])
    .select('file_manifest', 'zip_hash')

  for (const bundle of bundles) {
    const manifest: Record<string, string> = JSON.parse(bundle.file_manifest ?? '{}')
    for (const sha256 of Object.values(manifest)) {
      referencedHashes.add(sha256.replace('sha256:', ''))
    }
    if (bundle.zip_hash) referencedHashes.add(bundle.zip_hash)
  }

  // List all objects in storage
  let deletedCount = 0
  let continuationToken: string | undefined

  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'bundles/',
      ContinuationToken: continuationToken,
    }))

    const toDelete = (response.Contents ?? [])
      .map(obj => obj.Key!)
      .filter(key => {
        const hash = key.split('/').pop()!
        return !referencedHashes.has(hash)
      })

    if (toDelete.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: toDelete.map(Key => ({ Key })) },
      }))
      deletedCount += toDelete.length
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  console.log(`[cleanup] Deleted ${deletedCount} orphaned objects from storage`)
  return { deletedCount }
}
```

---

### `aggregate-analytics` — Daily Analytics Rollup

Triggered by: Scheduled job (daily at 02:00 UTC). Aggregates `update_checks` into summary rows for the dashboard charts (reduces query cost on large datasets).

```typescript
// packages/codesync-api/src/jobs/aggregate-analytics.ts
import { Job } from 'bullmq'
import { db } from '../db/knex.js'

export async function aggregateAnalyticsJob(_job: Job) {
  // Aggregate yesterday's update_checks into daily summaries
  await db.raw(`
    INSERT INTO update_check_daily_summary (app_id, date, total_checks, updates_delivered, no_update, bytes_transferred)
    SELECT
      app_id,
      DATE(created_at) AS date,
      COUNT(*) AS total_checks,
      COUNT(*) FILTER (WHERE response_type = 'update_available') AS updates_delivered,
      COUNT(*) FILTER (WHERE response_type = 'no_update') AS no_update,
      COALESCE(SUM(bytes_to_transfer), 0) AS bytes_transferred
    FROM update_checks
    WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'
    GROUP BY app_id, DATE(created_at)
    ON CONFLICT (app_id, date) DO UPDATE
      SET total_checks      = EXCLUDED.total_checks,
          updates_delivered = EXCLUDED.updates_delivered,
          no_update         = EXCLUDED.no_update,
          bytes_transferred = EXCLUDED.bytes_transferred
  `)
}
```

---

## Scheduled Jobs (Cron)

BullMQ supports repeatable jobs. Register these in the worker startup:

```typescript
// packages/codesync-api/src/worker.ts (additions)
import { Queue } from 'bullmq'

const deviceCleanupQueue = new Queue('device-cleanup', { connection })
const analyticsQueue     = new Queue('analytics', { connection })
const storageCleanupQueue = new Queue('storage-cleanup', { connection })

// Register repeatable jobs (idempotent — safe to run on every worker restart)
await deviceCleanupQueue.add('daily-cleanup', {}, {
  repeat: { pattern: '0 3 * * *' },   // 03:00 UTC daily
  jobId: 'device-cleanup-daily',       // fixed ID prevents duplicates
})

await analyticsQueue.add('daily-rollup', {}, {
  repeat: { pattern: '0 2 * * *' },   // 02:00 UTC daily
  jobId: 'analytics-daily-rollup',
})

await storageCleanupQueue.add('weekly-cleanup', {}, {
  repeat: { pattern: '0 4 * * 0' },   // 04:00 UTC every Sunday
  jobId: 'storage-cleanup-weekly',
})
```

---

## Retry Policy

| Queue | Attempts | Backoff |
|-------|----------|---------|
| `bundle-processing` | 3 | Exponential: 5s, 25s, 125s |
| `notifications` | 5 | Exponential: 2s, 4s, 8s, 16s, 32s |
| `device-cleanup` | 1 | No retry (reschedule next day) |
| `analytics` | 2 | Fixed: 60s |
| `storage-cleanup` | 1 | No retry (reschedule next week) |

```typescript
// Example retry config for bundle-processing queue
const bundleQueue = new Queue('bundle-processing', { connection })
await bundleQueue.add('process', payload, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 100 },   // keep last 100 completed jobs for debugging
  removeOnFail:     { count: 500 },   // keep last 500 failed jobs
})
```

---

## Monitoring

BullMQ exposes job counts and health via the BullMQ Board UI or custom metrics:

```typescript
// packages/codesync-api/src/routes/health.ts
import { Queue } from 'bullmq'

export async function queueHealth() {
  const queues = ['bundle-processing', 'notifications', 'device-cleanup', 'analytics']

  return Promise.all(queues.map(async (name) => {
    const q = new Queue(name, { connection })
    const counts = await q.getJobCounts('waiting', 'active', 'failed', 'delayed')
    return { queue: name, ...counts }
  }))
}
```

```
GET /health/queues
→ [
    { "queue": "bundle-processing", "waiting": 0, "active": 1, "failed": 0, "delayed": 0 },
    { "queue": "notifications", "waiting": 5, "active": 2, "failed": 0, "delayed": 0 }
  ]
```

Dead letter (consistently failing) jobs are visible in the BullMQ Board dashboard at `http://localhost:8080/queues` (served by the `codesync-dashboard` container).
