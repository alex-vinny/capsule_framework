import { describe, it, expect, beforeEach } from 'vitest'
import { CapabilitiesModule, CapabilitiesMethods } from '../capabilities.js'
import { FakeBridge } from '../testing/fake-bridge.js'

describe('CapabilitiesModule', () => {
  let bridge: FakeBridge
  let capabilities: CapabilitiesModule

  beforeEach(() => {
    bridge = new FakeBridge()
    capabilities = new CapabilitiesModule(bridge)
  })

  it('get returns the capability map', async () => {
    bridge.mockResolve(CapabilitiesMethods.GET, { capabilities: { app: 1, camera: 1 } })
    const result = await capabilities.get()
    expect(result.capabilities).toEqual({ app: 1, camera: 1 })
    expect(bridge.calls[0].method).toBe('capsule.getCapabilities')
  })

  it('has returns true when version meets the minimum', async () => {
    bridge.mockResolve(CapabilitiesMethods.GET, { capabilities: { app: 2 } })
    expect(await capabilities.has('app')).toBe(true)
    expect(await capabilities.has('app', 2)).toBe(true)
  })

  it('has returns false when version is below the minimum or absent', async () => {
    bridge.mockResolve(CapabilitiesMethods.GET, { capabilities: { app: 1 } })
    expect(await capabilities.has('app', 2)).toBe(false)
    expect(await capabilities.has('nfc')).toBe(false)
  })
})
