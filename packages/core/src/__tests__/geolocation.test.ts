import { describe, it, expect, beforeEach } from 'vitest'
import { GeolocationModule, type GeolocationPosition } from '../geolocation.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

const mockPosition: GeolocationPosition = {
  coords: {
    latitude: -23.55,
    longitude: -46.63,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1717000000000,
}

describe('GeolocationModule', () => {
  let bridge: FakeBridge
  let geo: GeolocationModule

  beforeEach(() => {
    bridge = new FakeBridge()
    geo = new GeolocationModule(bridge)
  })

  it('getCurrentPosition calls the correct method and returns position', async () => {
    bridge.mockResolve('geolocation.getCurrentPosition', mockPosition)

    const pos = await geo.getCurrentPosition()

    expect(pos).toEqual(mockPosition)
    expect(bridge.calls[0]).toEqual({
      method: 'geolocation.getCurrentPosition',
      params: {},
    })
  })

  it('passes options to getCurrentPosition', async () => {
    bridge.mockResolve('geolocation.getCurrentPosition', mockPosition)

    await geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 })

    expect(bridge.calls[0].params).toEqual({ enableHighAccuracy: true, timeout: 5000 })
  })

  it('propagates permission denied error', async () => {
    bridge.mockReject('geolocation.getCurrentPosition', new CapsuleError(2001, 'PERMISSION_DENIED'))
    await expect(geo.getCurrentPosition()).rejects.toThrow('PERMISSION_DENIED')
  })

  it('propagates location unavailable error', async () => {
    bridge.mockReject(
      'geolocation.getCurrentPosition',
      new CapsuleError(3001, 'LOCATION_UNAVAILABLE')
    )
    await expect(geo.getCurrentPosition()).rejects.toThrow('LOCATION_UNAVAILABLE')
  })

  it('watchPosition emits updates via notification handler', () => {
    bridge.mockResolve('geolocation.watchPosition', undefined)

    const received: GeolocationPosition[] = []
    geo.watchPosition((pos) => received.push(pos))

    bridge.emit('geolocation.positionUpdate', mockPosition)
    bridge.emit('geolocation.positionUpdate', { ...mockPosition, timestamp: 1717000001000 })

    expect(received).toHaveLength(2)
    expect(received[0]).toEqual(mockPosition)
  })
})
