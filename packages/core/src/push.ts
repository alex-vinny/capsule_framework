// Docs: docs/guide/push-notifications.md, docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * A remote-push registration token.
 *
 * - `android` — an FCM registration token.
 * - `ios` — an APNs device token (Phase 4).
 */
export interface PushToken {
  /** FCM registration token (Android) or APNs device token (iOS). */
  value: string
  platform: 'android' | 'ios'
}

/**
 * A push message, as it arrives in the foreground ({@link PushModule.onMessage})
 * or behind a tap ({@link PushModule.onNotificationTap} /
 * {@link PushModule.getLaunchNotification}).
 */
export interface PushMessage {
  id: string
  title?: string
  body?: string
  /** Custom key-value data payload from the server. */
  data?: Record<string, string>
  /** iOS only — the badge count the server requested. */
  badge?: number
  sound?: string
  /** `true` when this message caused the app to launch or resume (a tap). */
  launchNotification?: boolean
}

/**
 * An Android notification channel (API 26+). Channel ops are **no-ops on iOS**,
 * which has no channel concept — calling them is safe and simply does nothing.
 */
export interface NotificationChannel {
  id: string
  name: string
  description?: string
  importance: 'min' | 'low' | 'default' | 'high' | 'max'
  sound?: string
  vibration?: boolean
  lights?: boolean
  /** Hex `#RRGGBB` for the notification LED (when the device has one). */
  lightColor?: string
}

/** Permission status — aligned with the W3C Permissions API (mirrors 021-CoreAPI). */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'prompt' // first request — the system dialog will appear
  | 'prompt-with-rationale' // Android: denied once, show a rationale before re-asking

/** Returned by every event listener. Call it to stop receiving events. */
export type Unsubscribe = () => void

/**
 * Bridge method names — single source of truth, shared with WebBridge and the
 * native handlers. The first block is request/response; the second block is
 * **notifications** (native → JS push, no response) delivered over the shared
 * `BridgeEventEmitter`, exactly like `network.statusChange` / `app.urlOpen`.
 */
export const PushMethods = {
  // request/response
  REGISTER: 'push.register',
  CREATE_CHANNEL: 'push.createChannel',
  REMOVE_CHANNEL: 'push.removeChannel',
  LIST_CHANNELS: 'push.listChannels',
  REMOVE_ALL_DELIVERED: 'push.removeAllDeliveredNotifications',
  CHECK_PERMISSIONS: 'push.checkPermissions',
  REQUEST_PERMISSIONS: 'push.requestPermissions',
  GET_LAUNCH_NOTIFICATION: 'push.getLaunchNotification', // consume-once, mirrors app.getLaunchUrl
  // native → JS events
  MESSAGE: 'push.message', // foreground arrival
  NOTIFICATION_TAP: 'push.notificationTap', // warm tap
  REGISTRATION_ERROR: 'push.registrationError',
} as const

/**
 * Remote push notifications (FCM / APNs).
 *
 * **Tap routing mirrors `app` deep links** (the same cold/warm split #3 proved on
 * device): a tap on a notification that *cold-launches* the app surfaces through
 * the consume-once {@link getLaunchNotification}; a tap while the app is already
 * running/backgrounded fires {@link onNotificationTap}. Route on both at startup
 * to cover every entry path, just like `app.getLaunchUrl` + `app.onUrlOpen`:
 *
 * ```ts
 * const { message } = await push.getLaunchNotification()
 * if (message) route(message)               // launched by a notification tap
 * push.onNotificationTap((msg) => route(msg)) // taps while running
 * push.onMessage((msg) => toast(msg))         // foreground arrivals
 * ```
 *
 * Channel methods are Android-only (API 26+) and silently no-op on iOS.
 */
export class PushModule {
  constructor(private readonly bridge: Bridge) {}

  /** Register for remote push. Resolves the platform token, or rejects `PUSH_REGISTRATION_FAILED`. */
  register(): Promise<PushToken> {
    return this.bridge.call<PushToken>(PushMethods.REGISTER)
  }

  /** Create (or update) an Android notification channel. No-op on iOS. */
  createChannel(channel: NotificationChannel): Promise<void> {
    return this.bridge.call<void>(PushMethods.CREATE_CHANNEL, channel)
  }

  /** Delete an Android notification channel by id. No-op on iOS. */
  removeChannel(id: string): Promise<void> {
    return this.bridge.call<void>(PushMethods.REMOVE_CHANNEL, { id })
  }

  /** List the app's Android notification channels. Resolves `[]` on iOS. */
  listChannels(): Promise<NotificationChannel[]> {
    return this.bridge
      .call<{ channels: NotificationChannel[] }>(PushMethods.LIST_CHANNELS)
      .then((r) => r.channels)
  }

  /** Clear every notification this app has posted to the tray/Notification Center. */
  removeAllDeliveredNotifications(): Promise<void> {
    return this.bridge.call<void>(PushMethods.REMOVE_ALL_DELIVERED)
  }

  /** Read the current notification permission without prompting. */
  checkPermissions(): Promise<{ notifications: PermissionStatus }> {
    return this.bridge.call<{ notifications: PermissionStatus }>(PushMethods.CHECK_PERMISSIONS)
  }

  /** Prompt for notification permission (Android 13+ / iOS). Returns the resulting status. */
  requestPermissions(): Promise<{ notifications: PermissionStatus }> {
    return this.bridge.call<{ notifications: PermissionStatus }>(PushMethods.REQUEST_PERMISSIONS)
  }

  /**
   * The notification tap that *cold-launched* the app, or `null` for a normal
   * launch. Consume-once: a second call resolves `null`. Mirrors
   * {@link AppModule.getLaunchUrl} — see the class doc for the get-then-subscribe
   * startup pattern.
   */
  getLaunchNotification(): Promise<{ message: PushMessage | null }> {
    return this.bridge.call<{ message: PushMessage | null }>(PushMethods.GET_LAUNCH_NOTIFICATION)
  }

  /** Subscribe to push messages arriving while the app is foregrounded. Returns an unsubscribe fn. */
  onMessage(callback: (message: PushMessage) => void): Unsubscribe {
    return this.bridge.on(PushMethods.MESSAGE, (params) => callback(params as PushMessage))
  }

  /** Subscribe to taps on notifications while the app is running/backgrounded (warm). */
  onNotificationTap(callback: (message: PushMessage) => void): Unsubscribe {
    return this.bridge.on(PushMethods.NOTIFICATION_TAP, (params) => callback(params as PushMessage))
  }

  /** Subscribe to asynchronous registration failures (e.g. an FCM token refresh error). */
  onRegistrationError(callback: (error: { message: string; code: number }) => void): Unsubscribe {
    return this.bridge.on(PushMethods.REGISTRATION_ERROR, (params) =>
      callback(params as { message: string; code: number })
    )
  }
}
