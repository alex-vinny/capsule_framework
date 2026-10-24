import { describe, it, expect, beforeEach } from 'vitest'
import { DeviceModule, type DeviceInfo } from '../device.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

const mockInfo: DeviceInfo = {
  platform: 'android',
  model: 'Pixel 7',
  manufacturer: 'Google',
  osVersion: '14',
  sdkVersion: 34,
  isVirtual: false,
  webViewVersion: '120.0',
}

describe('DeviceModule', () => {
  let bridge: FakeBridge
  let device: DeviceModule

  beforeEach(() => {
    bridge = new FakeBridge()
    device = new DeviceModule(bridge)
  })

  it('calls device.getInfo and returns device info', async () => {
    bridge.mockResolve('device.getInfo', mockInfo)

    const info = await device.getInfo()

    expect(info).toEqual(mockInfo)
    expect(bridge.calls[0]).toEqual({ method: 'device.getInfo', params: undefined })
  })

  it('exposes platform correctly', async () => {
    bridge.mockResolve('device.getInfo', mockInfo)
    const info = await device.getInfo()
    expect(info.platform).toBe('android')
  })

  it('handles virtual device flag', async () => {
    bridge.mockResolve('device.getInfo', { ...mockInfo, isVirtual: true })
    const info = await device.getInfo()
    expect(info.isVirtual).toBe(true)
  })

  it('handles null webViewVersion', async () => {
    bridge.mockResolve('device.getInfo', { ...mockInfo, webViewVersion: null })
    const info = await device.getInfo()
    expect(info.webViewVersion).toBeNull()
  })

  it('propagates bridge errors', async () => {
    bridge.mockReject('device.getInfo', new CapsuleError(1003, 'INTERNAL_ERROR'))
    await expect(device.getInfo()).rejects.toThrow('INTERNAL_ERROR')
  })
})
