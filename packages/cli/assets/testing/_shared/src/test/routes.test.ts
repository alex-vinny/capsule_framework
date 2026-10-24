/**
 * Route handler unit tests — handlers are pure functions, so they run instantly
 * with no device, bridge, or server. Assert the shapes your UI depends on.
 */
import { describe, it, expect } from 'vitest'
import hello from '../routes/hello'
import { GET } from '../server/routes/ping'

describe('hello (JSON-RPC route)', () => {
  it('greets the provided name', () => {
    expect(hello({ name: 'Ada' })).toEqual({ message: expect.stringContaining('Ada') })
  })

  it('defaults to World', () => {
    expect(hello({})).toEqual({ message: expect.stringContaining('World') })
  })
})

describe('GET /api/ping (HTTP route)', () => {
  it('returns 200 + echoes the path', () => {
    const res = GET({ method: 'GET', path: '/api/ping', body: null, headers: {} })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body!)).toEqual({ status: 'ok', path: '/api/ping' })
  })
})
