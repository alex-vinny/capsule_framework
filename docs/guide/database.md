---
title: "Database (SQLite)"
audience: app-developer
status: current
code:
  - packages/core/src/db.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/db/**
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/db/**
  - packages/capsule-ios/Sources/dev/capsule/sqlite/**
tests:
  - packages/core/src/__tests__/db.test.ts
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/handlers/db/**
  - packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/db/**
  - packages/capsule-ios/Tests/CapsuleTests/sqlite/**
---
# Database (`db`) — SQLite

> **Status:** implemented — Android (`AndroidDbProvider`) + iOS provider (`SqliteDbProvider`, bridge
> wiring lands with the iOS bring-up) + `@capsule/core` `db`. Capability `db`, version 1.
> Design source: the `db` section of [core-api.md](../reference/core-api.md). This page records what
> shipped and where it deliberately differs.

## What shipped

```typescript
import { db } from '@capsule/core'

// Migrations for the tables you manage — run in order, each in its own transaction,
// before the next database operation. Never edit a version that has shipped.
db.schema(1, async (tx) => {
  await tx.sql`CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, ts INTEGER)`
})

// Reads resolve to rows…
const recent = await db.sql<{ id: number; title: string }[]>`
  SELECT id, title FROM notes WHERE ts > ${Date.now() - 86_400_000} ORDER BY ts DESC
`

// …statements without columns to { rowsAffected, insertId? }
const { insertId } = await db.sql<{ rowsAffected: number; insertId?: number }>`
  INSERT INTO notes (title, ts) VALUES (${'Hello'}, ${Date.now()})
`

// Atomic: committed when the callback resolves, rolled back when it throws.
await db.transaction(async (tx) => {
  await tx.sql`UPDATE notes SET title = ${'Renamed'} WHERE id = ${insertId!}`
  await tx.sql`DELETE FROM notes WHERE ts < ${0}`
})
```

| Piece | Contract |
|---|---|
| `db.sql` | Tagged template. Each `${value}` becomes a `?` **bound parameter** — values are never spliced into SQL text. One statement per call (anything after the first is ignored). Resolves to rows when the statement returns columns (`SELECT`, `PRAGMA`, `RETURNING`), else `{ rowsAffected, insertId? }`. |
| Values in | `null`, `number`, `string`, `boolean` (stored 1/0), `Uint8Array` / `ArrayBuffer` (BLOB). Anything else (`undefined`, `NaN`, `Date`, `bigint`, objects) rejects with a `TypeError` naming the parameter. |
| Values out | `null`, `number`, `string`, `Uint8Array` (BLOB). Integers beyond 2^53 lose precision in JS. Alias duplicate column names (`a.id AS aId`) — rows are objects. |
| `rowsAffected` / `insertId` | Rows inserted/updated/deleted by the statement, **including by triggers** (0 for DDL). `insertId` is the rowid of the last row the statement inserted; absent if it inserted none. |
| `db.transaction(fn)` | `BEGIN IMMEDIATE` … `COMMIT`, or `ROLLBACK` + rethrow. Resolves to `fn`'s result. |
| `db.schema(version, fn)` | Version kept in `PRAGMA user_version`. A database newer than every registered version fails all operations with `SCHEMA_VERSION_REGRESSION` (e.g. an OTA rollback to an older bundle — ship a migration-compatible bundle instead). |

**One thing at a time.** The database has one connection and runs one operation at a time. While a
transaction is open, other `db.sql` / `db.transaction` calls **wait** for it — so inside the
callback use `tx.sql`. Awaiting `db.sql` or a nested `db.transaction` there waits for the
transaction it is part of: a deterministic hang you will see the first time the code runs.

**Storage.** One database per app — Android `databases/capsule.db`, iOS
`Application Support/Capsule/capsule.db` — outside the OTA bundle dirs, so a code push never
touches it. Not available in the browser fallback (`METHOD_NOT_FOUND`).

**Errors.** `SQL_ERROR` (8001; SQLite's message in `error.data`), `SCHEMA_VERSION_REGRESSION`
(8002). 021's draft numbers (3010–3012, 4010) sat inside the location and media ranges.

## Deferred from the 021 design

- **`db.collection<T>()`** — zero-SQL CRUD with an auto-managed table and query builder.
- **Encrypted `database.open(name, { key })`** — needs SQLCipher on both platforms; also brings
  `DATABASE_NOT_OPEN` and `ENCRYPTION_ERROR`.
- **Collection sync helpers** (`changesSince` / `applyChanges`).

All three build on the shipped `db.sql` + transaction primitives without changing them.

## Native side

Bridge methods: `db.sql` (`{ sql, params }`), `db.begin`, `db.commit`, `db.rollback`. Wire values
are JSON `null` / number / string, or `{ "$blob": "<base64>" }`. The JS module serialises every
operation, so the native providers need no transaction ids; `db.begin` first rolls back a
transaction left open by a JS context that died mid-way (page reload).

| | Android | iOS |
|---|---|---|
| Provider | `dev.capsule.db.AndroidDbProvider` over `SQLiteDatabase` | `SqliteDbProvider` over the SQLite3 C API |
| Threading | One dedicated thread — `SQLiteDatabase` binds a transaction to its thread, and a Capsule transaction spans several bridge calls. Process-wide, survives Activity recreation. | One connection behind a lock |
| Typed binds | Cursor factory binds on the `SQLiteQuery` (`rawQuery` would bind every value as text) | `sqlite3_bind_*` |
| Handlers | `dev.capsule.handlers.db.dbHandlers(provider)` | `DbHandler` (JSON in / out) |
| Tests | `DbHandlerTest` (JVM, fake), `AndroidDbProviderTest` (device) | `DbHandlerTests` (Linux, fake), `SqliteDbProviderTests` (real SQLite) |
