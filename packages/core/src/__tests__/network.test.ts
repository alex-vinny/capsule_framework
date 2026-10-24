import { describe, it, expect, beforeEach } from 'vitest'
import { NetworkModule, NetworkMethods, type NetworkStatus } from '../network.js'
import { FakeBridge } from '../testing/fake-bridge.js'

const wifi: NetworkStatus = { connected: true, connectionType: 'wifi' }
const offline: NetworkStatus = { connected: false, connectionType: 'none' }

describe('NetworkModule', () => {
  let bridge: FakeBridge
  let net: NetworkModule

  beforeEach(() => {
    bridge = new FakeBridge()
    net = new NetworkModule(bridge)
  })

  it('getStatus calls network.getStatus and returns the status', async () => {
    bridge.mockResolve(NetworkMethods.GET_STATUS, wifi)
    expect(await net.getStatus()).toEqual(wifi)
    expect(bridge.calls[0]).toEqual({ method: 'network.getStatus', params: undefined })
  })

  it('onStatusChange receives every transition', () => {
    const received: NetworkStatus[] = []
    net.onStatusChange((s) => received.push(s))

    bridge.emit(NetworkMethods.STATUS_CHANGE, offline)
    bridge.emit(NetworkMethods.STATUS_CHANGE, wifi)

    expect(received).toEqual([offline, wifi])
  })

  it('subscriptions can be unsubscribed', () => {
    const received: NetworkStatus[] = []
    const off = net.onStatusChange((s) => received.push(s))

    bridge.emit(NetworkMethods.STATUS_CHANGE, offline)
    off()
    bridge.emit(NetworkMethods.STATUS_CHANGE, wifi)

    expect(received).toEqual([offline])
  })
})
