---
title: "Server design: database"
audience: maintainer
status: planned
---
# CodeSync Server — Database

> PostgreSQL data model for the CodeSync backend. Covers schema, indexes, migrations, and data lifecycle.

---

## Database Choice

**PostgreSQL 16** — chosen for:
- JSONB columns (device metadata, rollout rules, bundle manifests)
- Row-level security (RLS) for multi-tenant isolation
- `pg_cron` for scheduled cleanup without external workers
- Proven at scale for time-series update-check data

Self-hosted: runs as the `postgres` container in `docker-compose.yml`.
Cloud: managed RDS/CloudSQL/Supabase — connect via `DATABASE_URL` env var.

Migration tool: **Knex.js** — co-located with the `codesync-api` Node.js service. Run with `pnpm migrate:latest`.

---

## Schema

### `organizations`

```sql
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,           -- URL-safe name: "acme-corp"
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'enterprise'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ                     -- soft delete
);

CREATE INDEX organizations_slug_idx ON organizations(slug) WHERE deleted_at IS NULL;
```

---

### `apps`

```sql
CREATE TABLE apps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,              -- "my-app" (unique within org)
  name            TEXT NOT NULL,
  bundle_id       TEXT NOT NULL,             -- reverse-domain: "com.example.myapp"
  platform        TEXT NOT NULL,             -- 'android' | 'ios' | 'both'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,

  UNIQUE(org_id, slug)
);

CREATE INDEX apps_org_id_idx ON apps(org_id) WHERE deleted_at IS NULL;
```

---

### `api_keys`

```sql
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,              -- human label: "CI/CD key"
  key_hash        TEXT NOT NULL UNIQUE,       -- SHA-256 of the raw key (never store plaintext)
  key_prefix      TEXT NOT NULL,              -- first 8 chars shown in UI: "csk_abc1"
  scopes          TEXT[] NOT NULL DEFAULT '{}',  -- ['publish', 'read', 'admin']
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX api_keys_key_hash_idx ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX api_keys_org_id_idx ON api_keys(org_id);
```

**Key generation**: CLI generates a random 32-byte key, prefixed with `csk_`. Raw key is shown once to the user and never stored. Only `SHA-256(rawKey)` is stored.

---

### `channels`

Update channels within an app (e.g. `production`, `staging`, `beta`).

```sql
CREATE TABLE channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,              -- 'production' | 'staging' | 'beta'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(app_id, name)
);
```

---

### `bundles`

A bundle = one complete web build (`dist/` ZIP). Content-addressed — the ZIP is stored in file storage by its SHA-256 hash. See [file-storage.md](file-storage.md).

```sql
CREATE TABLE bundles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  version         TEXT NOT NULL,              -- semver from capsule.config.ts: "1.4.2"
  build_number    INTEGER NOT NULL,           -- monotonic: 47
  label           TEXT,                       -- optional human label: "hotfix-login-crash"
  notes           TEXT,                       -- release notes (markdown)

  -- Content-addressed storage
  zip_hash        TEXT NOT NULL,              -- SHA-256 of bundle.zip
  zip_size_bytes  INTEGER NOT NULL,
  file_count      INTEGER NOT NULL,           -- number of files inside the ZIP

  -- Individual file hashes for differential downloads
  -- Stored as JSONB: { "assets/main-abc123.js": "sha256:...", ... }
  file_manifest   JSONB NOT NULL DEFAULT '{}',

  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'   → uploaded, not yet processed
  -- 'active'    → current live bundle for the channel
  -- 'archived'  → superseded by newer bundle
  -- 'failed'    → processing failed (see processing_error)
  -- 'rolled_back' → manually rolled back

  processing_error TEXT,                     -- set if status = 'failed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at    TIMESTAMPTZ,               -- when status changed to 'active'
  archived_at     TIMESTAMPTZ
);

CREATE INDEX bundles_app_channel_idx ON bundles(app_id, channel_id, status);
CREATE INDEX bundles_zip_hash_idx ON bundles(zip_hash);  -- dedup check
```

---

### `bundle_files`

Content-addressed file store — each unique file content is stored once. Multiple bundles can reference the same file (e.g. unchanged `vendor-react.js`).

```sql
CREATE TABLE bundle_files (
  sha256          TEXT PRIMARY KEY,           -- SHA-256 of file content
  size_bytes      INTEGER NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**How differential downloads work:**
1. Bundle upload: server extracts ZIP, computes SHA-256 of each file, upserts into `bundle_files`
2. Device check-in: device sends its current file manifest (`{ filename: sha256 }`)
3. Server diffs: finds which files the device is missing
4. Response: only URLs for missing files — unchanged files skipped entirely
5. Result: a hotfix changing 2 JS chunks out of a 2MB bundle transfers ~30KB

---

### `rollouts`

Controls which devices receive a bundle and at what percentage.

```sql
CREATE TABLE rollouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id       UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  channel_id      UUID NOT NULL REFERENCES channels(id),

  strategy        TEXT NOT NULL DEFAULT 'percentage',
  -- 'percentage' → random cohort by device_id hash
  -- 'manual'     → specific device IDs (test devices)
  -- 'immediate'  → 100% instantly

  percentage      INTEGER NOT NULL DEFAULT 100 CHECK (percentage BETWEEN 0 AND 100),
  rollout_seed    INTEGER NOT NULL DEFAULT 42,   -- MurmurHash3 seed for cohort assignment

  -- Manual targeting: device IDs that always get this bundle
  target_device_ids TEXT[] DEFAULT '{}',

  -- Mandatory: device cannot skip this update
  mandatory       BOOLEAN NOT NULL DEFAULT false,

  -- Scheduling
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused_at       TIMESTAMPTZ,               -- rollout paused
  completed_at    TIMESTAMPTZ,              -- reached 100%

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rollouts_channel_bundle_idx ON rollouts(channel_id, bundle_id);
```

---

### `devices`

Anonymous device registry — no PII stored.

```sql
CREATE TABLE devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,

  device_id       TEXT NOT NULL,              -- UUID generated by shell on first launch
  platform        TEXT NOT NULL,             -- 'android' | 'ios'
  shell_version   TEXT NOT NULL,             -- '1.4.0' — native capsule version
  app_version     TEXT NOT NULL,             -- '2.1.0' — store build version
  os_version      TEXT NOT NULL,             -- 'Android 14' | 'iOS 17.2'

  current_bundle_id  UUID REFERENCES bundles(id),   -- what the device currently has loaded
  current_zip_hash   TEXT,                   -- SHA-256 of the currently loaded bundle

  -- File-level cache: what individual files the device already has
  -- { "assets/main-abc123.js": "sha256:...", ... }
  file_cache      JSONB NOT NULL DEFAULT '{}',

  -- Custom metadata provided by the app at device enrollment (locale, timezone, etc.)
  metadata        JSONB NOT NULL DEFAULT '{}',

  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(app_id, device_id)
);

CREATE INDEX devices_app_id_idx ON devices(app_id);
CREATE INDEX devices_device_id_idx ON devices(device_id);
CREATE INDEX devices_last_seen_idx ON devices(app_id, last_seen_at DESC);
```

---

### `update_checks`

Append-only log of every device check-in. Used for analytics and rollout tracking.

```sql
CREATE TABLE update_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  channel_id      UUID REFERENCES channels(id),

  -- What the device had
  current_bundle_id  UUID REFERENCES bundles(id),
  current_zip_hash   TEXT,

  -- What we decided to send
  response_type   TEXT NOT NULL,
  -- 'no_update'       → device is current
  -- 'update_available' → bundle URL(s) returned
  -- 'mandatory_update' → must update
  -- 'rollback'        → device rolled back to previous bundle

  bundle_id_offered  UUID REFERENCES bundles(id),  -- NULL if no_update
  bytes_to_transfer  INTEGER,              -- estimated download (differential)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partition by month for query performance (Postgres declarative partitioning)
-- CREATE TABLE update_checks_2025_01 PARTITION OF update_checks
--   FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE INDEX update_checks_app_created_idx ON update_checks(app_id, created_at DESC);
CREATE INDEX update_checks_device_idx ON update_checks(device_id, created_at DESC);
```

---

### `update_check_daily_summary`

Pre-aggregated daily metrics for dashboard charts. Populated by the `aggregate-analytics` worker job (see `workers.md`). Avoids full-table scans on `update_checks` for dashboard queries.

```sql
CREATE TABLE update_check_daily_summary (
  app_id              UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  total_checks        BIGINT NOT NULL DEFAULT 0,
  updates_delivered   BIGINT NOT NULL DEFAULT 0,
  no_update           BIGINT NOT NULL DEFAULT 0,
  bytes_transferred   BIGINT NOT NULL DEFAULT 0,

  PRIMARY KEY (app_id, date)
);

CREATE INDEX update_check_daily_summary_date_idx
  ON update_check_daily_summary(app_id, date DESC);
```

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| `organizations` | `slug` WHERE not deleted | Org lookup by slug |
| `apps` | `org_id` WHERE not deleted | All apps for an org |
| `api_keys` | `key_hash` WHERE not revoked | Auth middleware — hot path |
| `bundles` | `(app_id, channel_id, status)` | Active bundle lookup |
| `bundles` | `zip_hash` | Deduplication on upload |
| `devices` | `(app_id, device_id)` UNIQUE | Device upsert |
| `devices` | `last_seen_at DESC` | Stale device cleanup |
| `update_checks` | `(app_id, created_at DESC)` | Analytics queries |
| `update_check_daily_summary` | `(app_id, date DESC)` | Dashboard chart queries |

---

## Migrations

Managed by **Knex.js** in `packages/codesync-api/src/db/migrations/`.

```bash
# Apply all pending migrations
pnpm --filter codesync-api migrate:latest

# Rollback one migration
pnpm --filter codesync-api migrate:rollback

# Check migration status
pnpm --filter codesync-api migrate:status
```

Migration file naming: `YYYYMMDDHHMMSS_description.ts`

```typescript
// packages/codesync-api/src/db/migrations/20250101000000_initial_schema.ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

  await knex.schema.createTable('organizations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('slug').notNullable().unique()
    t.text('name').notNullable()
    t.text('plan').notNullable().defaultTo('free')
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('deleted_at', { useTz: true }).nullable()
  })
  // ... rest of tables
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organizations')
}
```

---

## Connection Configuration

```typescript
// packages/codesync-api/src/db/knex.ts
import Knex from 'knex'

export const db = Knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 20,                    // tune per worker count
    acquireTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  },
  acquireConnectionTimeout: 10000,
})
```

Environment:
```
DATABASE_URL=postgres://codesync:password@postgres:5432/codesync
```

---

## Data Retention

| Table | Retention | Mechanism |
|-------|-----------|-----------|
| `update_checks` | 90 days | `pg_cron` job: `DELETE FROM update_checks WHERE created_at < now() - interval '90 days'` |
| `devices` | 180 days since `last_seen_at` | `pg_cron` weekly job |
| `bundles` (archived) | 365 days | Soft — `archived_at` set; files in storage cleaned separately |
| `bundle_files` | Until no bundle references it | Cleanup job in [workers.md](workers.md) |
| `organizations` (deleted) | 30 days | Grace period before hard delete cascade |

---

## Multi-Tenancy

Row-level security is NOT used in the initial MVP — all queries include explicit `WHERE org_id = $orgId` and `WHERE app_id = $appId` clauses enforced at the API layer. RLS is a Phase 8 (Ecosystem) hardening item.

The `api_keys` table scopes every request to an org: `SELECT org_id FROM api_keys WHERE key_hash = $hash AND revoked_at IS NULL`.
