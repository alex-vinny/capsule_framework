/**
 * Component test — renders the real <App/> with a FakeBridge swapped in for
 * @capsule/core, so the UI wiring (tab switching, route calls, result display)
 * is exercised in jsdom with no device. Catches render regressions and broken
 * async-result plumbing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FakeBridge } from '@capsule/core'

// Swap the singleton bridge for a FakeBridge and stub native alerts. The test
// reads the same instance back through the (mocked) `bridge` export and drives it.
vi.mock('@capsule/core', async (importActual) => {
  const actual = await importActual<typeof import('@capsule/core')>()
  return {
    ...actual,
    bridge: new actual.FakeBridge(),
    alerts: { show: vi.fn().mockResolvedValue({}) },
  }
})

import App from '../App'
import { bridge } from '@capsule/core'
const fake = bridge as unknown as FakeBridge

beforeEach(() => {
  fake.calls.length = 0
})

describe('<App/>', () => {
  it('renders the home tab with the framework badge', () => {
    render(<App />)
    expect(screen.getByText('React + TypeScript')).toBeInTheDocument()
  })

  it('Call hello route → displays the bridge result', async () => {
    fake.mockResolve('hello', { message: 'Hello, World! (from QuickJS)' })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('Server')) // switch to Server tab
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
    render(<App />)
    await user.click(screen.getByText('Server'))
    await user.click(screen.getByText('GET /api/ping'))
    expect(await screen.findByText(/"status":\s*"ok"/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
