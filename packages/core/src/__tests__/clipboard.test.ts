import { describe, it, expect, beforeEach } from 'vitest'
import { ClipboardModule } from '../clipboard.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

describe('ClipboardModule', () => {
  let bridge: FakeBridge
  let clipboard: ClipboardModule

  beforeEach(() => {
    bridge = new FakeBridge()
    clipboard = new ClipboardModule(bridge)
  })

  it('read returns the clipboard text', async () => {
    bridge.mockResolve('clipboard.read', { value: 'hello world' })

    const text = await clipboard.read()

    expect(text).toBe('hello world')
    expect(bridge.calls[0]).toEqual({ method: 'clipboard.read', params: undefined })
  })

  it('read returns null when clipboard is empty', async () => {
    bridge.mockResolve('clipboard.read', { value: null })

    const text = await clipboard.read()

    expect(text).toBeNull()
  })

  it('write calls clipboard.write with the text', async () => {
    bridge.mockResolve('clipboard.write', undefined)

    await clipboard.write('copied text')

    expect(bridge.calls[0]).toEqual({ method: 'clipboard.write', params: { text: 'copied text' } })
  })

  it('write rejects on bridge error', async () => {
    bridge.mockReject('clipboard.write', new CapsuleError(1003, 'INTERNAL_ERROR'))
    await expect(clipboard.write('text')).rejects.toThrow('INTERNAL_ERROR')
  })

  it('read rejects on bridge error', async () => {
    bridge.mockReject('clipboard.read', new CapsuleError(2001, 'PERMISSION_DENIED'))
    await expect(clipboard.read()).rejects.toThrow('PERMISSION_DENIED')
  })
})
