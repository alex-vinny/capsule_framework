import { describe, it, expect, beforeEach } from 'vitest'
import { AppModule, AppMethods, type AppState, type UrlOpenEvent } from '../app.js'
import { FakeBridge } from '../testing/fake-bridge.js'

describe('AppModule', () => {
  let bridge: FakeBridge
  let app: AppModule

  beforeEach(() => {
    bridge = new FakeBridge()
    app = new AppModule(bridge)
  })

  it('getState calls app.getState and returns the state', async () => {
    bridge.mockResolve(AppMethods.GET_STATE, { isActive: true })
    const state = await app.getState()
    expect(state).toEqual({ isActive: true })
    expect(bridge.calls[0]).toEqual({ method: 'app.getState', params: undefined })
  })

  it('getLaunchUrl returns the cold-launch url', async () => {
    bridge.mockResolve(AppMethods.GET_LAUNCH_URL, { url: 'myapp://order/42' })
    expect(await app.getLaunchUrl()).toEqual({ url: 'myapp://order/42' })
  })

  it('getLaunchUrl returns null url on a normal launch', async () => {
    bridge.mockResolve(AppMethods.GET_LAUNCH_URL, { url: null })
    expect(await app.getLaunchUrl()).toEqual({ url: null })
  })

  it('onStateChange receives every transition', () => {
    const received: AppState[] = []
    app.onStateChange((s) => received.push(s))

    bridge.emit(AppMethods.STATE_CHANGE, { isActive: false })
    bridge.emit(AppMethods.STATE_CHANGE, { isActive: true })

    expect(received).toEqual([{ isActive: false }, { isActive: true }])
  })

  it('onResume fires only on foreground transitions', () => {
    let resumes = 0
    app.onResume(() => resumes++)

    bridge.emit(AppMethods.STATE_CHANGE, { isActive: false })
    bridge.emit(AppMethods.STATE_CHANGE, { isActive: true })
    bridge.emit(AppMethods.STATE_CHANGE, { isActive: true })

    expect(resumes).toBe(2)
  })

  it('onPause fires only on background transitions', () => {
    let pauses = 0
    app.onPause(() => pauses++)

    bridge.emit(AppMethods.STATE_CHANGE, { isActive: true })
    bridge.emit(AppMethods.STATE_CHANGE, { isActive: false })

    expect(pauses).toBe(1)
  })

  it('onUrlOpen receives deep links delivered while running', () => {
    const received: UrlOpenEvent[] = []
    app.onUrlOpen((e) => received.push(e))

    bridge.emit(AppMethods.URL_OPEN, { url: 'myapp://invite/abc' })

    expect(received).toEqual([{ url: 'myapp://invite/abc' }])
  })

  it('subscriptions can be unsubscribed', () => {
    const received: AppState[] = []
    const off = app.onStateChange((s) => received.push(s))

    bridge.emit(AppMethods.STATE_CHANGE, { isActive: false })
    off()
    bridge.emit(AppMethods.STATE_CHANGE, { isActive: true })

    expect(received).toEqual([{ isActive: false }])
  })
})
