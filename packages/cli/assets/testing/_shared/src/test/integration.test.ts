/**
 * HML / staging integration — hermetic by default, opt-in against a live backend.
 *
 * Runs only when CAPSULE_API_BASE is set, so `capsule test` stays offline and
 * deterministic in CI. To exercise a real environment:
 *
 *   CAPSULE_API_BASE=https://hml.example.com capsule test
 */
import { describe, it, expect } from 'vitest'

const BASE = process.env.CAPSULE_API_BASE

describe.skipIf(!BASE)('HML integration (CAPSULE_API_BASE)', () => {
  it('GET /api/ping on the live backend returns ok', async () => {
    const res = await fetch(`${BASE}/api/ping`)
    expect(res.ok).toBe(true)
    const data = (await res.json()) as { status?: string }
    expect(data.status).toBe('ok')
  })
})
