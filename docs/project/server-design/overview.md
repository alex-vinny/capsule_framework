---
title: "Server design: portal and self-hosting"
audience: maintainer
status: planned
---
# Capsule Server — Portal & Self-Hosted Infrastructure

> The Capsule Portal is the management layer for CodeSync: org registration, app management, API key generation, and the device dashboard. It can be self-hosted or used as Capsule Cloud.

---

## What the Portal Is

The portal is the **control plane** for CodeSync. It is not required to build or run Capsule apps — only needed when you want to use CodeSync OTA updates.

```
┌────────────────────────────────────────────────────────┐
│                   Capsule Portal                        │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │  Org signup  │   │  App mgmt    │   │  API Keys  │  │
│  │  User auth   │   │  Channels    │   │  Webhooks  │  │
│  └──────────────┘   └──────────────┘   └────────────┘  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │         CodeSync Dashboard (embedded)              │ │
│  │  Bundle releases · Device fleet · Rollout control  │ │
│  └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
          ↕  REST API (authenticated by API key)
┌────────────────────────────────────────────────────────┐
│              capsule codesync publish                   │
│              (CLI on developer's machine or CI)         │
└────────────────────────────────────────────────────────┘
```

---

## Two Deployment Modes

| Mode | Setup | Best for |
|------|-------|----------|
| **Capsule Cloud** | No setup — sign up at `capsule.dev` | Teams who want zero infrastructure |
| **Self-hosted** | Run `Capsule-Server` via Docker Compose | Enterprises with data residency requirements, offline environments |

Both expose the exact same API. Switching between them is one line in `capsule.config.ts` (`codeSync.url`).

---

## Self-Hosted: What You Run

```
capsule-server/
  docker-compose.yml     ← full stack definition
  .env                   ← secrets (never committed)
  nginx.conf             ← reverse proxy (optional, for custom domain + TLS)
  migrations/            ← database schema (runs automatically on start)
```

The stack (defined in `../../contributing/docker.md`):
- `codesync-api` — Fastify backend
- `codesync-dashboard` — React dashboard (nginx static)
- `postgres:16` — primary database
- `redis:7` — check endpoint cache
- `minio` — S3-compatible bundle storage (or replace with real S3/R2)

---

## Account & Organization Setup

### Step 1 — First Admin Account

On first launch, the portal is unseeded. The first user to register becomes the organization owner.

```
Self-hosted:  http://your-server:8080/setup
Capsule Cloud: https://capsule.dev/signup
```

Registration requires:
- Email address
- Password (min 12 characters)
- Organization name (e.g. "Acme Corp")

The organization name becomes part of the API namespace. Multiple organizations can exist on one self-hosted instance (multi-tenant).

### Step 2 — Invite Team Members

```
Dashboard → Organization → Members → Invite
```

Roles:

| Role | Permissions |
|------|------------|
| **Owner** | Full access — billing, org settings, delete org |
| **Admin** | Manage apps, members, API keys, all releases |
| **Releaser** | Publish bundles, promote between channels, roll back. Cannot manage team members or billing. |
| **Developer** | Publish bundles, manage releases, view devices |
| **Viewer** | Read-only access to dashboard and device fleet |

All roles authenticate via email + password. SSO (SAML/OIDC) is on the roadmap.

---

## Registering an App

Each `appId` must be registered in the portal before the CLI can publish to it.

```
Dashboard → Apps → New App
→ App ID:     com.yourcompany.app   (must match capsule.config.ts appId)
→ App Name:   My App
→ Platform:   Android | iOS | Both
```

### Channels

After creating the app, create the channels you need:

```
Dashboard → Apps → [your app] → Channels → Add Channel
```

Default channels created automatically:
- `production`
- `staging`

Additional channels (e.g. `qa`, `beta`, `internal`) can be added freely. The channel name is just a string — it matches `capsule.config.ts codeSync.channel`.

---

## API Keys

API keys authorize the CLI to publish bundles. They are scoped to an **organization** — one key can publish bundles for any app within the org. To restrict a key to specific apps, use the `scopes` field when creating the key. API keys are **never embedded in the app binary**.

### Generating a Key

```
Dashboard → Apps → [your app] → Settings → API Keys → Generate Key
→ Key name:  "CI/CD Key" or "Alex's laptop"
→ Scope:     publish (write) | read-only
→ Expiry:    never | 90 days | 1 year (recommended: 1 year with rotation reminder)
```

The key is shown **once** — copy it immediately. It looks like:
```
csk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Prefix `csk_live_` for production, `csk_test_` for sandbox/staging apps.

### Using the Key

```bash
# .env.local (never commit)
CODESYNC_API_KEY=csk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# CI secret (GitHub/GitLab/Azure):
# Name: CODESYNC_API_KEY
# Value: csk_live_...
```

```typescript
// capsule.config.ts
codeSync: {
  url:    process.env.CODESYNC_URL,       // https://your-server or https://api.capsule.dev
  apiKey: process.env.CODESYNC_API_KEY,   // from portal
  channel: process.env.CHANNEL || 'production'
}
```

### Key Rotation

```
Dashboard → Apps → [your app] → Settings → API Keys
→ Click "Rotate" on the existing key
→ New key generated, old key immediately revoked
→ Update CI secret before the old key is used again
```

Rotate keys:
- When a team member with key access leaves
- After any suspected compromise
- On a regular schedule (quarterly recommended)

---

## Dashboard Authentication Flow

### Login

```
POST /auth/login
{ "email": "alex@company.com", "password": "..." }
→ { "accessToken": "...", "refreshToken": "..." }
```

- `accessToken` — short-lived JWT (15 minutes), used in `Authorization: Bearer` header
- `refreshToken` — longer-lived (30 days), stored in httpOnly cookie, used to get new access tokens
- After 30 days of inactivity, full re-login required

### Session Persistence

The dashboard stores the refresh token in an httpOnly, SameSite=Strict cookie. The access token is in memory only (never localStorage — XSS protection). On page reload, the dashboard silently exchanges the refresh token for a new access token.

### Password Reset

```
POST /auth/forgot-password
{ "email": "alex@company.com" }
→ Email sent with reset link (valid 1 hour)
```

The self-hosted portal sends email via SMTP. Configure in `.env`:
```bash
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASS=...
SMTP_FROM="Capsule Portal <noreply@yourcompany.com>"
```

---

## Self-Hosted Docker Compose

```yaml
# capsule-server/docker-compose.yml

services:
  codesync-api:
    image: ghcr.io/capsule/codesync-api:latest
    restart: unless-stopped
    environment:
      DATABASE_URL:    ${DATABASE_URL}
      REDIS_URL:       ${REDIS_URL}
      STORAGE_ENDPOINT: ${STORAGE_ENDPOINT}
      STORAGE_BUCKET:  ${STORAGE_BUCKET}
      STORAGE_ACCESS_KEY: ${STORAGE_ACCESS_KEY}
      STORAGE_SECRET_KEY: ${STORAGE_SECRET_KEY}
      JWT_SECRET:      ${JWT_SECRET}           # random 64-char string
      SMTP_HOST:       ${SMTP_HOST}
      SMTP_PORT:       ${SMTP_PORT}
      SMTP_USER:       ${SMTP_USER}
      SMTP_PASS:       ${SMTP_PASS}
      SMTP_FROM:       ${SMTP_FROM}
      PUBLIC_URL:      ${PUBLIC_URL}           # https://codesync.yourcompany.com
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  codesync-dashboard:
    image: ghcr.io/capsule/codesync-dashboard:latest
    restart: unless-stopped
    environment:
      VITE_API_URL: ${PUBLIC_URL}   # where the dashboard calls the API
    ports:
      - "8080:80"
    depends_on:
      - codesync-api

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER:     capsule
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB:       capsule
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U capsule"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio:RELEASE.2024-11-07T00-52-20Z
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER:     ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  postgres-data:
  redis-data:
  minio-data:
```

---

## Self-Hosted `.env` Template

```bash
# capsule-server/.env
# Copy to .env and fill in values. Never commit .env.

# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgres://capsule:CHANGE_ME@postgres:5432/capsule
POSTGRES_PASSWORD=CHANGE_ME

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── Object storage (MinIO for self-hosted, or real S3/R2) ────────────────────
STORAGE_ENDPOINT=http://minio:9000
STORAGE_BUCKET=capsule-bundles
STORAGE_ACCESS_KEY=CHANGE_ME
STORAGE_SECRET_KEY=CHANGE_ME
MINIO_ROOT_USER=CHANGE_ME
MINIO_ROOT_PASSWORD=CHANGE_ME

# ── Auth ─────────────────────────────────────────────────────────────────────
# Generate with: openssl rand -hex 64
JWT_SECRET=CHANGE_ME_64_CHAR_HEX_STRING

# ── Email (for password reset + invitations) ──────────────────────────────────
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASS=CHANGE_ME
SMTP_FROM=Capsule Portal <noreply@yourcompany.com>

# ── Public URL (used in email links, CORS, CDN config) ───────────────────────
PUBLIC_URL=https://codesync.yourcompany.com
```

---

## First-Time Launch

```bash
# 1. Clone or copy the Capsule-Server directory
cd Capsule-Server

# 2. Copy and fill the env template
cp .env.example .env
# → edit .env with your values

# 3. Start the stack
docker compose up -d

# 4. Run database migrations (once — idempotent after that)
docker compose exec codesync-api node dist/migrate.js

# 5. Open the dashboard
# → http://localhost:8080  (or your PUBLIC_URL)
# → Register the first admin account
# → Create an organization
# → Create your first app
# → Generate an API key
```

---

## Using Real S3 or Cloudflare R2 Instead of MinIO

For production, replace MinIO with a managed object store.

**AWS S3:**
```bash
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_BUCKET=your-capsule-bundles-bucket
STORAGE_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Cloudflare R2** (S3-compatible, no egress fees — recommended):
```bash
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=capsule-bundles
STORAGE_ACCESS_KEY=<R2 Access Key ID>
STORAGE_SECRET_KEY=<R2 Secret Access Key>
```

Remove the `minio` service from `docker-compose.yml` when using an external store.

---

## Connecting the CLI to Self-Hosted Portal

```typescript
// capsule.config.ts
codeSync: {
  url:    'https://codesync.yourcompany.com',  // your PUBLIC_URL
  apiKey: process.env.CODESYNC_API_KEY,
  channel: 'production'
}
```

```bash
# Verify connectivity
capsule codesync releases
# → Lists releases from your self-hosted server
```

---

## Folder Structure in This Directory

```
Server/
  overview.md        ← this file: portal control plane, self-hosted setup, org/app/key management
  database.md        ← PostgreSQL schema, migrations, data lifecycle
  file-storage.md     ← content-addressed bundle storage, MinIO/S3, CDN, differential downloads
  workers.md         ← BullMQ job queues, all job types, cron schedules
  docker-compose.yml     ← production stack
  .env.example           ← template (commit this, not .env)
  nginx.conf             ← optional reverse proxy for TLS termination
  migrations/            ← SQL migration files (run by codesync-api on start)
```
