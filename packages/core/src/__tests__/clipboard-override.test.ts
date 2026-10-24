/**
 * Demonstrates and verifies the module override pattern.
 *
 * Because all modules are plain classes that accept a Bridge in their
 * constructor, consumers can subclass them to change or extend behavior
 * without touching the framework. FakeBridge lets us verify the override
 * in a pure unit test — no native runtime needed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ClipboardModule } from '../clipboard.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import type { Bridge } from '../bridge.js'

// ── Example override ─────────────────────────────────────────────────────────

class PrefixedClipboard extends ClipboardModule {
  constructor(
    bridge: Bridge,
    private readonly prefix: string
  ) {
    super(bridge)
  }

  override write(text: string): Promise<void> {
    return super.write(`${this.prefix} ${text}`)
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClipboardModule override — PrefixedClipboard', () => {
  let bridge: FakeBridge
  let clipboard: PrefixedClipboard

  beforeEach(() => {
    bridge = new FakeBridge()
    clipboard = new PrefixedClipboard(bridge, '[COPY]')
  })

  it('prepends the prefix before delegating write to the bridge', async () => {
    bridge.mockResolve('clipboard.write', undefined)

    await clipboard.write('hello world')

    expect(bridge.calls[0]).toEqual({
      method: 'clipboard.write',
      params: { text: '[COPY] hello world' },
    })
  })

  it('prepends the prefix to an empty string', async () => {
    bridge.mockResolve('clipboard.write', undefined)

    await clipboard.write('')

    expect(bridge.calls[0].params).toEqual({ text: '[COPY] ' })
  })

  it('does not alter read — inherited behaviour is unchanged', async () => {
    bridge.mockResolve('clipboard.read', { value: 'something' })

    const result = await clipboard.read()

    expect(result).toBe('something')
    expect(bridge.calls[0]).toEqual({ method: 'clipboard.read', params: undefined })
  })

  it('supports a different prefix via constructor', async () => {
    bridge.mockResolve('clipboard.write', undefined)
    const tagged = new PrefixedClipboard(bridge, '[APP]')

    await tagged.write('data')

    expect(bridge.calls[0].params).toEqual({ text: '[APP] data' })
  })

  it('propagates bridge errors through the override', async () => {
    const { CapsuleError } = await import('../errors.js')
    bridge.mockReject('clipboard.write', new CapsuleError(1003, 'INTERNAL_ERROR'))

    await expect(clipboard.write('fail')).rejects.toThrow('INTERNAL_ERROR')
  })
})
