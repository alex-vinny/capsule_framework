import { describe, it, expect, beforeEach } from 'vitest'
import {
  PushModule,
  PushMethods,
  type NotificationChannel,
  type PushMessage,
  type PushToken,
} from '../push.js'
import { FakeBridge } from '../testing/fake-bridge.js'

const token: PushToken = { value: 'fcm-abc', platform: 'android' }
const channel: NotificationChannel = { id: 'chat', name: 'Chat', importance: 'high' }
const message: PushMessage = { id: 'm1', title: 'Hi', body: 'there', data: { k: 'v' } }

describe('PushModule', () => {
  let bridge: FakeBridge
  let push: PushModule

  beforeEach(() => {
    bridge = new FakeBridge()
    push = new PushModule(bridge)
  })

  // ── wire constants ──────────────────────────────────────────────────────────

  it('exposes the documented method-name wire constants', () => {
    expect(PushMethods).toMatchObject({
      REGISTER: 'push.register',
      CREATE_CHANNEL: 'push.createChannel',
      REMOVE_CHANNEL: 'push.removeChannel',
      LIST_CHANNELS: 'push.listChannels',
      REMOVE_ALL_DELIVERED: 'push.removeAllDeliveredNotifications',
      CHECK_PERMISSIONS: 'push.checkPermissions',
      REQUEST_PERMISSIONS: 'push.requestPermissions',
      GET_LAUNCH_NOTIFICATION: 'push.getLaunchNotification',
      MESSAGE: 'push.message',
      NOTIFICATION_TAP: 'push.notificationTap',
      REGISTRATION_ERROR: 'push.registrationError',
    })
  })

  // ── request/response ──────────────────────────────────────────────────────────

  it('register returns the platform token', async () => {
    bridge.mockResolve(PushMethods.REGISTER, token)
    expect(await push.register()).toEqual(token)
    expect(bridge.calls[0]).toEqual({ method: 'push.register', params: undefined })
  })

  it('register surfaces a registration failure as a rejection', async () => {
    const { CapsuleError, CapsuleErrorCode } = await import('../errors.js')
    bridge.mockReject(
      PushMethods.REGISTER,
      CapsuleError.from(CapsuleErrorCode.PUSH_REGISTRATION_FAILED)
    )
    const err = await push.register().catch((e) => e)
    expect((err as InstanceType<typeof CapsuleError>).code).toBe(6001)
  })

  it('createChannel passes the channel through', async () => {
    bridge.mockResolve(PushMethods.CREATE_CHANNEL, undefined)
    await push.createChannel(channel)
    expect(bridge.calls[0]).toEqual({ method: 'push.createChannel', params: channel })
  })

  it('removeChannel sends the id', async () => {
    bridge.mockResolve(PushMethods.REMOVE_CHANNEL, undefined)
    await push.removeChannel('chat')
    expect(bridge.calls[0]).toEqual({ method: 'push.removeChannel', params: { id: 'chat' } })
  })

  it('listChannels unwraps the channels array', async () => {
    bridge.mockResolve(PushMethods.LIST_CHANNELS, { channels: [channel] })
    expect(await push.listChannels()).toEqual([channel])
  })

  it('checkPermissions / requestPermissions return the notification status', async () => {
    bridge.mockResolve(PushMethods.CHECK_PERMISSIONS, { notifications: 'granted' })
    bridge.mockResolve(PushMethods.REQUEST_PERMISSIONS, { notifications: 'denied' })
    expect(await push.checkPermissions()).toEqual({ notifications: 'granted' })
    expect(await push.requestPermissions()).toEqual({ notifications: 'denied' })
  })

  it('getLaunchNotification returns the consume-once launch message', async () => {
    bridge.mockResolve(PushMethods.GET_LAUNCH_NOTIFICATION, { message })
    expect(await push.getLaunchNotification()).toEqual({ message })
  })

  // ── events ──────────────────────────────────────────────────────────────────

  it('onMessage receives foreground arrivals', () => {
    const seen: PushMessage[] = []
    push.onMessage((m) => seen.push(m))
    bridge.emit(PushMethods.MESSAGE, message)
    expect(seen).toEqual([message])
  })

  it('onNotificationTap receives warm taps and can unsubscribe', () => {
    const seen: PushMessage[] = []
    const off = push.onNotificationTap((m) => seen.push(m))
    bridge.emit(PushMethods.NOTIFICATION_TAP, message)
    off()
    bridge.emit(PushMethods.NOTIFICATION_TAP, message)
    expect(seen).toEqual([message])
  })

  it('onRegistrationError receives the error payload', () => {
    const seen: Array<{ message: string; code: number }> = []
    push.onRegistrationError((e) => seen.push(e))
    bridge.emit(PushMethods.REGISTRATION_ERROR, { message: 'token refresh failed', code: 6001 })
    expect(seen).toEqual([{ message: 'token refresh failed', code: 6001 }])
  })
})
