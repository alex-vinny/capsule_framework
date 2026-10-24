# @capsule/codesync-api — local/self-hosted CodeSync server

The minimal, file-based OTA delivery server (Fastify, single process, JSON manifest).
This is the **local/self-hosted** delivery half of CodeSync; the managed cloud
Portal/control plane (PostgreSQL + storage workers + billing) is a separate design.

## Endpoints

`GET /health` · `GET /bundles/:version` (or `latest`, ETag-cached) ·
`GET /manifest[?channel=]` · `GET /releases[?channel=]` ·
`POST /publish` (multipart + `x-api-key`) · `POST /rollback` · `POST /pause` ·
`POST /resume` · `GET /devices` (204, MRR stub).

Full API contract: [`api-spec.yaml`](./api-spec.yaml) (OpenAPI 3).
Runtime data lands in `storage/` (gitignored): `manifest.json` + `bundles/<version>.js`.

## Run

```bash
pnpm --filter @capsule/codesync-api run build   # tsc → dist/
CODESYNC_API_KEY=dev-local pnpm --filter @capsule/codesync-api run start  # :3000
```

Windows PowerShell: `$env:CODESYNC_API_KEY='dev-local'; pnpm --filter @capsule/codesync-api run start`.

> **Multipart note:** `@fastify/multipart` v7 exposes `data.fields` values as
> `{ type, fieldname, value }` objects, not plain strings — the publish handler
> unwraps `.value`. Don't regress this.

## Docs

Using it from an app (config, publish, channels, rollback, self-host vs hosted):
[`docs/guide/ota-updates.md`](../../docs/guide/ota-updates.md).
Mechanism (bundle ZIP, manifest, crash-loop rollback, known gaps):
[`docs/contributing/codesync-internals.md`](../../docs/contributing/codesync-internals.md).
Managed Portal (cloud): [`docs/project/server-design/overview.md`](../../docs/project/server-design/overview.md).
