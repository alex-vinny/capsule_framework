import { describe, it, expect, beforeEach } from 'vitest'
import { HapticsModule } from '../haptics.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

describe('HapticsModule', () => {
  let bridge: FakeBridge
  let haptics: HapticsModule

  beforeEach(() => {
    bridge = new FakeBridge()
    haptics = new HapticsModule(bridge)
  })

  it('calls haptics.vibrate with the given style', async () => {
    bridge.mockResolve('haptics.vibrate', undefined)

    await haptics.vibrate('heavy')

    expect(bridge.calls[0]).toEqual({ method: 'haptics.vibrate', params: { style: 'heavy' } })
  })

  it('defaults to medium style', async () => {
    bridge.mockResolve('haptics.vibrate', undefined)

    await haptics.vibrate()

    expect(bridge.calls[0].params).toEqual({ style: 'medium' })
  })

  it('accepts all valid styles', async () => {
    const styles = ['light', 'medium', 'heavy', 'success', 'warning', 'error', 'selection'] as const
    for (const style of styles) {
      bridge.mockResolve('haptics.vibrate', undefined)
      await expect(haptics.vibrate(style)).resolves.toBeUndefined()
    }
  })

  it('propagates bridge errors', async () => {
    bridge.mockReject('haptics.vibrate', new CapsuleError(2001, 'PERMISSION_DENIED'))
    await expect(haptics.vibrate('medium')).rejects.toThrow('PERMISSION_DENIED')
  })
})
