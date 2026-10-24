import { describe, it, expect, beforeEach } from 'vitest'
import { DbModule, DbMethods, type Transaction } from '../db.js'
import type { Bridge } from '../bridge.js'
import { CapsuleError, CapsuleErrorCode } from '../errors.js'

type Call = { method: string; params: unknown }

/**
 * Bridge whose answers come from a function, so a test can answer `PRAGMA user_version` and the
 * statements around it differently, or hold a call open to observe queueing.
 */
class ScriptedBridge implements Bridge {
  readonly calls: Call[] = []
  constructor(private answer: (call: Call) => unknown = () => ({ rowsAffected: 0 })) {}

  respond(answer: (call: Call) => unknown): void {
    this.answer = answer
  }

  call<T>(method: string, params?: unknown): Promise<T> {
    const call = { method, params }
    this.calls.push(call)
    try {
      return Promise.resolve(this.answer(call) as T)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  on(): () => void {
    return () => undefined
  }

  /** The SQL text of every db.sql call, in order. */
  sqlTexts(): string[] {
    return this.calls.map((c) =>
      c.method === DbMethods.SQL ? (c.params as { sql: string }).sql : c.method
    )
  }
}

describe('db.sql', () => {
  let bridge: ScriptedBridge
  let db: DbModule

  beforeEach(() => {
    bridge = new ScriptedBridge()
    db = new DbModule(bridge)
  })

  it('turns interpolations into ? placeholders and bound params — never SQL text', async () => {
    const name = "x'); DROP TABLE notes; --"

    await db.sql`SELECT * FROM notes WHERE title = ${name} AND ts > ${5}`

    expect(bridge.calls[0]).toEqual({
      method: 'db.sql',
      params: { sql: 'SELECT * FROM notes WHERE title = ? AND ts > ?', params: [name, 5] },
    })
  })

  it('encodes booleans as 1/0 and bytes as base64 blobs', async () => {
    await db.sql`INSERT INTO t VALUES (${true}, ${false}, ${null}, ${new Uint8Array([1, 2, 3])}, ${new Uint8Array([255]).buffer})`

    expect((bridge.calls[0].params as { params: unknown[] }).params).toEqual([
      1,
      0,
      null,
      { $blob: 'AQID' },
      { $blob: '/w==' },
    ])
  })

  it.each([
    ['undefined', undefined, 'undefined (use null)'],
    ['NaN', NaN, 'NaN'],
    ['Infinity', Infinity, 'Infinity'],
    ['a Date', new Date(0), 'a Date'],
    ['a bigint', 10n, 'a bigint'],
    ['an object', { a: 1 }, 'an object'],
  ])('rejects %s without calling the bridge', async (_label, value, message) => {
    await expect(db.sql`SELECT ${value as never}`).rejects.toThrow(TypeError)
    await expect(db.sql`SELECT ${value as never}`).rejects.toThrow(message)
    expect(bridge.calls).toHaveLength(0)
  })

  it('resolves to rows, decoding blob columns to Uint8Array', async () => {
    bridge.respond(() => ({ rows: [{ id: 1, title: 'a', note: null, data: { $blob: 'AQID' } }] }))

    const rows = await db.sql`SELECT * FROM notes`

    expect(rows).toEqual([{ id: 1, title: 'a', note: null, data: new Uint8Array([1, 2, 3]) }])
  })

  it('resolves to the run result for statements without columns', async () => {
    bridge.respond(() => ({ rowsAffected: 1, insertId: 42 }))
    expect(await db.sql`INSERT INTO notes DEFAULT VALUES`).toEqual({
      rowsAffected: 1,
      insertId: 42,
    })

    bridge.respond(() => ({ rowsAffected: 3 }))
    expect(await db.sql`UPDATE notes SET pinned = 1`).toEqual({ rowsAffected: 3 })
  })

  it('surfaces native SQL errors as CapsuleError', async () => {
    bridge.respond(() => {
      throw CapsuleError.from(CapsuleErrorCode.SQL_ERROR, 'no such table: notes')
    })

    await expect(db.sql`SELECT * FROM notes`).rejects.toMatchObject({ code: 8001 })
  })

  it('round-trips arbitrary bytes through base64', async () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    let sent: unknown
    bridge.respond((call) => {
      sent = (call.params as { params: unknown[] }).params[0]
      return { rows: [{ b: sent }] }
    })

    const [row] = (await db.sql`SELECT ${bytes} AS b`) as { b: Uint8Array }[]

    expect(row.b).toEqual(bytes)
  })
})

describe('db.transaction', () => {
  let bridge: ScriptedBridge
  let db: DbModule

  beforeEach(() => {
    bridge = new ScriptedBridge()
    db = new DbModule(bridge)
  })

  it('wraps the callback in begin / commit and returns its result', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.sql`UPDATE notes SET pinned = ${true}`
      return 'done'
    })

    expect(result).toBe('done')
    expect(bridge.sqlTexts()).toEqual(['db.begin', 'UPDATE notes SET pinned = ?', 'db.commit'])
  })

  it('rolls back and rethrows when the callback throws', async () => {
    const boom = new Error('boom')

    await expect(
      db.transaction(async (tx) => {
        await tx.sql`DELETE FROM notes`
        throw boom
      })
    ).rejects.toBe(boom)

    expect(bridge.sqlTexts()).toEqual(['db.begin', 'DELETE FROM notes', 'db.rollback'])
  })

  it('makes db.sql issued meanwhile wait until the transaction finishes', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))

    const transaction = db.transaction(async (tx) => {
      await tx.sql`INSERT INTO a DEFAULT VALUES`
      await held
    })
    const outside = db.sql`SELECT * FROM b`
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.sqlTexts()).not.toContain('SELECT * FROM b')

    release()
    await Promise.all([transaction, outside])

    expect(bridge.sqlTexts()).toEqual([
      'db.begin',
      'INSERT INTO a DEFAULT VALUES',
      'db.commit',
      'SELECT * FROM b',
    ])
  })

  it('rejects tx.sql once the transaction has finished', async () => {
    let leaked!: Transaction
    await db.transaction(async (tx) => {
      leaked = tx
    })

    await expect(leaked.sql`SELECT 1`).rejects.toThrow('transaction already finished')
  })

  it('a failed operation does not block the ones queued after it', async () => {
    bridge.respond((call) => {
      if (call.method === DbMethods.BEGIN) throw new Error('busy')
      return { rows: [] }
    })

    await expect(db.transaction(async () => undefined)).rejects.toThrow('busy')
    await expect(db.sql`SELECT 1`).resolves.toEqual([])
  })
})

describe('db.schema', () => {
  let bridge: ScriptedBridge
  let db: DbModule
  let userVersion: number

  beforeEach(() => {
    userVersion = 0
    bridge = new ScriptedBridge((call) => {
      const sql = (call.params as { sql?: string } | undefined)?.sql
      if (sql === 'PRAGMA user_version') return { rows: [{ user_version: userVersion }] }
      const set = sql?.match(/^PRAGMA user_version = (\d+)$/)
      if (set) userVersion = Number(set[1])
      return { rowsAffected: 0 }
    })
    db = new DbModule(bridge)
  })

  it('runs pending migrations in version order, each in a transaction, before the next query', async () => {
    db.schema(2, async (tx) => {
      await tx.sql`ALTER TABLE notes ADD COLUMN author TEXT`
    })
    db.schema(1, async (tx) => {
      await tx.sql`CREATE TABLE notes (id TEXT PRIMARY KEY)`
    })

    await db.sql`SELECT * FROM notes`

    expect(bridge.sqlTexts()).toEqual([
      'PRAGMA user_version',
      'db.begin',
      'CREATE TABLE notes (id TEXT PRIMARY KEY)',
      'PRAGMA user_version = 1',
      'db.commit',
      'db.begin',
      'ALTER TABLE notes ADD COLUMN author TEXT',
      'PRAGMA user_version = 2',
      'db.commit',
      'SELECT * FROM notes',
    ])
  })

  it('skips versions already applied and checks only once', async () => {
    userVersion = 1
    db.schema(1, async () => {
      throw new Error('must not run')
    })

    await db.sql`SELECT 1`
    await db.sql`SELECT 2`

    expect(bridge.sqlTexts()).toEqual(['PRAGMA user_version', 'SELECT 1', 'SELECT 2'])
  })

  it('fails every operation with SCHEMA_VERSION_REGRESSION when the database is newer', async () => {
    userVersion = 5
    db.schema(1, async () => undefined)

    await expect(db.sql`SELECT 1`).rejects.toMatchObject({
      code: CapsuleErrorCode.SCHEMA_VERSION_REGRESSION.code,
    })
    await expect(db.sql`SELECT 1`).rejects.toBeInstanceOf(CapsuleError)
  })

  it('rolls back a failed migration and retries it on the next operation', async () => {
    let attempts = 0
    db.schema(1, async (tx) => {
      attempts++
      await tx.sql`CREATE TABLE notes (id)`
      if (attempts === 1) throw new Error('flaky')
    })

    await expect(db.sql`SELECT 1`).rejects.toThrow('flaky')
    expect(bridge.sqlTexts()).toContain('db.rollback')
    expect(userVersion).toBe(0)

    await db.sql`SELECT 1`
    expect(userVersion).toBe(1)
  })

  it('rejects versions that are not integers >= 1', () => {
    expect(() => db.schema(0, async () => undefined)).toThrow(TypeError)
    expect(() => db.schema(1.5, async () => undefined)).toThrow(TypeError)
  })
})
