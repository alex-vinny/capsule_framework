/**
 * App wiring test — loads the real index.html into jsdom, swaps a FakeBridge in
 * for @capsule/core, imports main.js (jQuery attaches the click handlers via
 * addEventListener, so a native .click() fires them), then drives the buttons.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@capsule/core', async (importActual) => {
  const actual = await importActual()
  return { ...actual, bridge: new actual.FakeBridge(), alerts: { show: vi.fn() } }
})

import { bridge } from '@capsule/core'
const fake = bridge

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''
  await import('../main') // jQuery binds click handlers to the now-present DOM
})

beforeEach(() => {
  fake.calls.length = 0
})

describe('app wiring', () => {
  it('Call hello route → writes the bridge result into #rpc-result', async () => {
    fake.mockResolve('hello', { message: 'Hello, World! (from QuickJS)' })
    document.getElementById('btn-rpc').click()
    await vi.waitFor(() =>
      expect(document.getElementById('rpc-result').textContent).toContain('World')
    )
    expect(fake.calls.at(-1)).toMatchObject({ method: 'hello' })
  })

  it('GET /api/ping → writes the fetched JSON into #ping-result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: 'ok', path: '/api/ping' }) })
    )
    document.getElementById('btn-ping').click()
    await vi.waitFor(() =>
      expect(document.getElementById('ping-result').textContent).toContain('"status":"ok"')
    )
    vi.unstubAllGlobals()
  })
})
