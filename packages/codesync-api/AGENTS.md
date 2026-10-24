# AGENTS.md — packages/codesync-api (self-hosted CodeSync server)

Parent: [`../../AGENTS.md`](../../AGENTS.md). Endpoints and run commands: [`README.md`](README.md).

The minimal, file-based OTA delivery server (Fastify, single process, JSON manifest) that anyone
can self-host; the managed cloud Portal is a separate design.

**Licence: AGPL-3.0-only** (see `LICENSE`) — the rest of the repo is Apache-2.0. Don't move code
from here into an Apache-licensed package, or the other way, without saying so in the change.

## Entry files

- `src/index.ts` — every route, auth and storage.
- `api-spec.yaml` — the OpenAPI 3 contract; change it with the route.
- `tests/smoke.test.ts` — vitest.
- `storage/` — runtime data (git-ignored); override with `CODESYNC_STORAGE_DIR`.

## Test

```sh
pnpm --filter @capsule/codesync-api test
pnpm --filter @capsule/codesync-api typecheck
```

## Local rules

- Write routes require the `x-api-key` header to match `CODESYNC_API_KEY`; never ship a default key.
- `@fastify/multipart` v7 exposes field values as `{ value }` objects — the publish handler unwraps
  `.value`. Don't regress it.
- The client side lives in the shells (`dev/capsule/codesync/` on Android and iOS) and the CLI
  (`capsule codesync`); a wire-format change updates all three.

## Docs

`docs/contributing/codesync-internals.md` · `docs/project/server-design/`.
