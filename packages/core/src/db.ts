// Docs: docs/guide/database.md, docs/reference/core-api.md
import type { Bridge } from './bridge.js'
import { CapsuleError, CapsuleErrorCode } from './errors.js'

/**
 * SQLite database — one per app, stored *outside* the OTA-swappable bundle dirs, so a code-push
 * bundle swap never touches it. Raw SQL through the {@link DbModule.sql} tagged template; values
 * are always bound as `?` parameters, never spliced into the SQL text.
 *
 * Not in this version (see docs/guide/database.md): `db.collection()` and encrypted
 * `database.open()` from the 021 design.
 */

/** A value that can be bound to a `?` placeholder. Booleans are stored as 1 / 0. */
export type SqlValue = null | number | string | boolean | Uint8Array | ArrayBuffer

/** A value read back from a column (SQLite's storage classes). */
export type SqlColumnValue = null | number | string | Uint8Array

/** One result row: column name → value. Alias duplicate column names (`a.id AS aId`). */
export type SqlRow = Record<string, SqlColumnValue>

/** Result of a statement that returns no columns (INSERT, UPDATE, DELETE, DDL, …). */
export interface SqlRunResult {
  /** Rows inserted, updated or deleted, including by triggers. 0 for DDL. */
  rowsAffected: number
  /** Rowid of the last row this statement inserted; absent if it inserted none. */
  insertId?: number
}

/** The handle a {@link DbModule.transaction} callback runs its statements on. */
export interface Transaction {
  sql<T = SqlRow[] | SqlRunResult>(strings: TemplateStringsArray, ...values: SqlValue[]): Promise<T>
}

export const DbMethods = {
  SQL: 'db.sql',
  BEGIN: 'db.begin',
  COMMIT: 'db.commit',
  ROLLBACK: 'db.rollback',
} as const

// ── Wire format (mirrors the native handlers) ────────────────────────────────

type WireValue = null | number | string | { $blob: string }

interface WireStatement {
  sql: string
  params: WireValue[]
}

type WireResult = { rows: Record<string, WireValue>[] } | SqlRunResult

/** One schema step for {@link DbModule.schema}, run inside a transaction. */
export type Migration = (tx: Transaction) => Promise<void>

export class DbModule {
  /** Tail of the queue every database operation runs through (see {@link transaction}). */
  private queue: Promise<unknown> = Promise.resolve()
  private readonly migrations = new Map<number, Migration>()
  private migrationsPending = false

  constructor(private readonly bridge: Bridge) {}

  /**
   * Runs one SQL statement. Interpolated values become bound parameters.
   *
   * Resolves to the rows for a statement that returns columns (SELECT, PRAGMA, `RETURNING`…),
   * otherwise to a {@link SqlRunResult}.
   *
   * ```ts
   * const recent = await db.sql<Note[]>`SELECT * FROM notes WHERE ts > ${since} ORDER BY ts DESC`
   * await db.sql`UPDATE notes SET pinned = ${true} WHERE id = ${id}`
   * ```
   */
  sql<T = SqlRow[] | SqlRunResult>(
    strings: TemplateStringsArray,
    ...values: SqlValue[]
  ): Promise<T> {
    let statement: WireStatement
    try {
      statement = toStatement(strings, values)
    } catch (e) {
      return Promise.reject(e)
    }
    return this.exclusive(() => this.run<T>(statement))
  }

  /**
   * Runs `fn` in a transaction: committed when it resolves, rolled back when it throws (the
   * error is rethrown). Resolves to `fn`'s result.
   *
   * The database runs one thing at a time: while a transaction is open, other `db.sql` and
   * `db.transaction` calls wait for it. So inside `fn` use **`tx.sql`** — awaiting `db.sql` or a
   * nested `db.transaction` there would wait for the transaction it is part of, forever.
   */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.exclusive(() => this.inTransaction(fn))
  }

  /**
   * Registers migration `version` (an integer ≥ 1) for tables you manage with `db.sql`. Pending
   * migrations run in version order, each in its own transaction, before the next database
   * operation; the applied version is kept in SQLite's `PRAGMA user_version`. Add a new version
   * for each change — never edit one that has shipped.
   *
   * If the database is already at a version newer than any registered (e.g. after an OTA rollback
   * to an older bundle), every operation fails with `SCHEMA_VERSION_REGRESSION`.
   */
  schema(version: number, migrate: Migration): void {
    if (!Number.isInteger(version) || version < 1) {
      throw new TypeError(`db.schema: version must be an integer >= 1, got ${version}`)
    }
    this.migrations.set(version, migrate)
    this.migrationsPending = true
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      await this.migrate()
      return work()
    })
    this.queue = result.catch(() => undefined)
    return result
  }

  private async run<T>(statement: WireStatement): Promise<T> {
    const result = await this.bridge.call<WireResult>(DbMethods.SQL, statement)
    if ('rows' in result) return result.rows.map(decodeRow) as T
    const run: SqlRunResult = { rowsAffected: result.rowsAffected }
    if (result.insertId !== undefined) run.insertId = result.insertId
    return run as T
  }

  private async inTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    await this.bridge.call(DbMethods.BEGIN)
    let open = true
    const tx: Transaction = {
      sql: <R>(strings: TemplateStringsArray, ...values: SqlValue[]): Promise<R> => {
        if (!open) return Promise.reject(new Error('db: transaction already finished'))
        try {
          return this.run<R>(toStatement(strings, values))
        } catch (e) {
          return Promise.reject(e)
        }
      },
    }
    try {
      const result = await fn(tx)
      await this.bridge.call(DbMethods.COMMIT)
      return result
    } catch (e) {
      await this.bridge.call(DbMethods.ROLLBACK).catch(() => undefined)
      throw e
    } finally {
      open = false
    }
  }

  /** Brings the database up to the newest registered schema version. Runs inside the queue. */
  private async migrate(): Promise<void> {
    if (!this.migrationsPending) return
    const [{ user_version: current }] = await this.run<{ user_version: number }[]>(
      toStatement(['PRAGMA user_version'], [])
    )
    const versions = [...this.migrations.keys()].sort((a, b) => a - b)
    const latest = versions[versions.length - 1]
    if (current > latest) {
      throw CapsuleError.from(
        CapsuleErrorCode.SCHEMA_VERSION_REGRESSION,
        `database is at schema version ${current}; this app registers versions up to ${latest}`
      )
    }
    for (const version of versions.filter((v) => v > current)) {
      const migrate = this.migrations.get(version)!
      await this.inTransaction(async (tx) => {
        await migrate(tx)
        // PRAGMA values cannot be bound; `version` is a validated integer.
        await this.run(toStatement([`PRAGMA user_version = ${version}`], []))
      })
    }
    this.migrationsPending = false
  }
}

// ── Encoding ──────────────────────────────────────────────────────────────────

/** `sql\`… ${a} … ${b}\`` → `{ sql: '… ? … ?', params: [a, b] }`. */
function toStatement(strings: readonly string[], values: SqlValue[]): WireStatement {
  return { sql: strings.join('?'), params: values.map(encodeValue) }
}

// `unknown`, not SqlValue: plain-JS callers can pass anything, and they get a clear error.
function encodeValue(value: unknown, index: number): WireValue {
  if (value === null || typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    throw new TypeError(`db.sql: parameter ${index + 1} is ${value}; SQLite cannot store it`)
  }
  if (value instanceof Uint8Array) return { $blob: toBase64(value) }
  if (value instanceof ArrayBuffer) return { $blob: toBase64(new Uint8Array(value)) }
  const kind = value === undefined ? 'undefined (use null)' : describe(value)
  throw new TypeError(
    `db.sql: parameter ${index + 1} is ${kind}; bind null, a number, a string, a boolean or bytes`
  )
}

function describe(value: unknown): string {
  if (value instanceof Date) return 'a Date (bind date.getTime() or date.toISOString())'
  if (typeof value === 'bigint') return 'a bigint'
  return typeof value === 'object' ? 'an object (bind JSON.stringify(value))' : typeof value
}

function decodeRow(row: Record<string, WireValue>): SqlRow {
  const out: SqlRow = {}
  for (const [column, value] of Object.entries(row)) {
    out[column] = value !== null && typeof value === 'object' ? fromBase64(value.$blob) : value
  }
  return out
}

// Base64 by hand: btoa/atob are not available in every JS runtime Capsule code runs in.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let j = 0
  for (const char of clean) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[j++] = (buffer >> bits) & 0xff
    }
  }
  return bytes
}
