/**
 * Component test — renders the real App.svelte with a FakeBridge swapped in for
 * @capsule/core, exercising tab switching + route-call result plumbing in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import type { FakeBridge } from '@capsule/core'

vi.mock('@capsule/core', async (importActual) => {
  const actual = await importActual<typeof import('@capsule/core')>()
  return {
    ...actual,
    bridge: new actual.FakeBridge(),
    alerts: { show: vi.fn().mockResolvedValue({}) },
  }
})

import App from '../App.svelte'
import { bridge } from '@capsule/core'
const fake = bridge as unknown as FakeBridge

beforeEach(() => {
  fake.calls.length = 0
})

describe('App.svelte', () => {
  it('renders the home tab with the framework badge', () => {
    render(App)
    expect(screen.getByText('Svelte + TypeScript')).toBeInTheDocument()
  })

  it('Call hello route → displays the bridge result', async () => {
    fake.mockResolve('hello', { message: 'Hello, World! (from QuickJS)' })
    const user = userEvent.setup()
    render(App)
    await user.click(screen.getByText('Server'))
    await user.click(screen.getByText('Call hello route'))
    expect(await screen.findByText('Hello, World! (from QuickJS)')).toBeInTheDocument()
    expect(fake.calls.at(-1)).toMatchObject({ method: 'hello' })
  })

  it('GET /api/ping → renders the fetched JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: 'ok', path: '/api/ping' }) })
    )
    const user = userEvent.setup()
    render(App)
    await user.click(screen.getByText('Server'))
    await user.click(screen.getByText('GET /api/ping'))
    expect(await screen.findByText(/"status":\s*"ok"/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
