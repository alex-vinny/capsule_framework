---
title: "Push notifications"
audience: app-developer
status: current
code:
  - packages/core/src/push.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/push/**
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/handlers/push/**
tests:
  - packages/core/src/__tests__/push.test.ts
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/push/**
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/handlers/push/**
---
# Push Notifications (FCM / APNs) — Implementation Design

> **Phase 3 · API #4.** Status: **Slice 1 built (2026-06-24), Slice 2 not started.** This doc is the
> execution plan — a fresh session can build the Android slice from it without re-deriving anything.
>
> **Slice 1 delivered:** `core/src/push.ts` + index export + WebBridge fallback (+`__capsulePushSimulate`)
> + `errors.ts` `PUSH_REGISTRATION_FAILED` (6001); Kotlin `PushProvider`/`PushController`/`PushHandlers`
> + `FakePushProvider` + `BridgeError.PushRegistrationFailed`; pure-JVM `PushControllerTest` +
> `PushHandlerTest`; `PushScreen.tsx` + registry. **Deviation:** `CapsuleActivity` wiring (§4) moved to
> **Slice 2** — it is inseparable from the `AndroidPushProvider` instance it must construct, and adding a
> throwaway no-op provider to `main/` would violate the no-placeholder bar. Slice 1's gate (offline tiers
> + browser dev via WebBridge) is fully satisfied without it; `capabilities.has('push')` is honestly
> `true` only in the browser until Slice 2 registers the native capability alongside the real provider.
>
> Prerequisites met: **App lifecycle + deep links** (#3 — provides the cold/warm tap-routing
> seam this design reuses) and **Network status** (#4-prereq — introduced the shared
> `BridgeEventEmitter` this design emits through). TS surface already specified in
> [the core API reference (push)](../reference/generated/core/README.md). Firebase ownership settled in
> [../decisions/log.md Q19](../decisions/log.md). Server-side
> delivery job is Phase 6 ([../project/server-design/workers.md](../project/server-design/workers.md)).

---

## 0. Decisions locked for this build

| # | Decision | Rationale |
|---|----------|-----------|
| **D1** | **Tap routing reuses the App-lifecycle cold/warm split.** Warm tap → `push.onNotificationTap` event (like `onUrlOpen`). Cold-launch tap → **consume-once `push.getLaunchNotification()`** (like `getLaunchUrl`). | Same seam #3 already proved on device; one mental model for the dev. |
| **D2** | **Cold tap delivered by pull (`getLaunchNotification`), not replay-on-subscribe.** | No race if the JS handler mounts late; dev owns timing (consume now / defer / ignore) — maximises developer freedom; deterministic to unit-test. Costs one extra method (added to 021 spec). |
| **D3** | **Two-slice rollout: Kotlin seam first, Firebase second.** Slice 1 = `PushProvider` interface + `FakePushProvider` + `PushController` + handlers + pure-JVM tests + WebBridge fake (NO real FCM). Slice 2 = `AndroidPushProvider` over FirebaseMessaging + Gradle/`google-services` wiring + CLI `google-services.json` sync + instrumented + device smoke. | Slice 1 keeps the offline tiers green and lands the whole contract; Firebase (build-system + CLI surface) is isolated to Slice 2. |
| **D4** | **`push` capability = version 1** in `CapabilityRegistry`. | Phase-5 OTA gating (same constraint as every Phase-3 API). |
| **D5** | **FCM token persists outside the OTA bundle dirs** — `SharedPreferences` (`capsule_push`) or `filesDir/capsule/push/`, never `filesDir/bundles`. | OTA constraint (a): a bundle swap must not wipe the registration token. |
| **D6** | **iOS (APNs) seam defined now, implemented Phase 4.** `PushProvider` is the cross-platform contract; the iOS impl wraps `UNUserNotificationCenter` + `didRegisterForRemoteNotificationsWithDeviceToken`, returns the same `PushToken{platform:'ios'}`. | Same interface-first convention Network used to name `NWPathMonitor` for Phase 4. |

> **D2 changes the public surface.** Add to [the core API reference (push)](../reference/generated/core/README.md):
> ```typescript
> /** Consume-once: the notification tap that cold-launched the app, or null. Mirrors app.getLaunchUrl(). */
> getLaunchNotification(): Promise<{ message: PushMessage | null }>
> ```
> `onNotificationTap` stays for warm (app already running/backgrounded) taps; the
> `launchNotification: true` flag on `PushMessage` still marks resume taps inside that callback.

---

## 1. The vertical slice (mirrors Network / App-lifecycle exactly)

| Layer | Existing reference | New file |
|-------|-------------------|----------|
| TS module | `core/src/network.ts` | `core/src/push.ts` |
| TS barrel export | `core/src/index.ts` | add `export * from './push'` + `push` singleton |
| WebBridge dev fallback | `core/src/web-bridge.ts` (network online/offline) | add `push.*` mocks to `web-bridge.ts` |
| Kotlin seam (interface) | `network/NetworkProvider.kt` | `push/PushProvider.kt` |
| Android impl | `network/AndroidNetworkProvider.kt` | `push/AndroidPushProvider.kt` *(Slice 2)* |
| FCM receiver | — *(new shape)* | `push/CapsulePushService.kt` *(Slice 2 — `FirebaseMessagingService`)* |
| Fake | `fakes/FakeNetworkProvider.kt` | `fakes/FakePushProvider.kt` |
| Controller (emit) | `network/NetworkStatusController.kt` | `push/PushController.kt` |
| Handlers | `handlers/network/NetworkHandlers.kt` | `handlers/push/PushHandlers.kt` |
| Pure-JVM tests | `network/NetworkStatusControllerTest.kt`, `handlers/network/NetworkHandlerTest.kt` | `push/PushControllerTest.kt`, `handlers/push/PushHandlerTest.kt` |
| Instrumented | `network/AndroidNetworkProviderTest.kt` | `push/AndroidPushProviderTest.kt` *(Slice 2)* |
| Activity wiring | `CapsuleActivity.kt` (register cap, init controller, lifecycle) | edit `CapsuleActivity.kt` |
| Example screen | `examples/react-ts/.../NetworkScreen.tsx` + `registry.ts` | `PushScreen.tsx` + registry entry |

---

## 2. TypeScript surface — `core/src/push.ts`

Mirror `network.ts` structure (types → method-name constants → module class). Types come
verbatim from [the core API reference (push)](../reference/generated/core/README.md): `PushToken`, `PushMessage`,
`NotificationChannel`, `PermissionStatus`.

```typescript
export const PushMethods = {
  // request/response
  REGISTER:                'push.register',
  CREATE_CHANNEL:          'push.createChannel',
  REMOVE_CHANNEL:          'push.removeChannel',
  LIST_CHANNELS:           'push.listChannels',
  REMOVE_ALL_DELIVERED:    'push.removeAllDeliveredNotifications',
  CHECK_PERMISSIONS:       'push.checkPermissions',
  REQUEST_PERMISSIONS:     'push.requestPermissions',
  GET_LAUNCH_NOTIFICATION: 'push.getLaunchNotification',   // D2, mirrors app.getLaunchUrl
  // native → JS events (over BridgeEventEmitter)
  MESSAGE:                 'push.message',                  // foreground arrival
  NOTIFICATION_TAP:        'push.notificationTap',          // warm tap
  REGISTRATION_ERROR:      'push.registrationError',
} as const
```

`PushModule` methods: `register`, `createChannel`, `removeChannel`, `listChannels`,
`removeAllDeliveredNotifications`, `checkPermissions`, `requestPermissions`,
`getLaunchNotification`, and the three subscription sugar methods `onMessage`,
`onNotificationTap`, `onRegistrationError` — each returning an unsubscribe fn, exactly like
`network.onStatusChange` / `app.onUrlOpen`.

**Error codes** (already in 021): `2001 NOTIFICATIONS_PERMISSION_DENIED`,
`3001 PUSH_REGISTRATION_FAILED`.

---

## 3. Kotlin seam — `push/PushProvider.kt`

```kotlin
interface PushProvider {
    /** Register for remote push. Async — token (or error) arrives via the callbacks. */
    fun register(onToken: (PushToken) -> Unit, onError: (PushError) -> Unit)

    fun checkPermissions(): PermissionStatus
    fun requestPermissions(onResult: (PermissionStatus) -> Unit)

    // Android-only channel ops (no-op on iOS)
    fun createChannel(channel: NotificationChannel)
    fun removeChannel(id: String)
    fun listChannels(): List<NotificationChannel>
    fun removeAllDeliveredNotifications()

    /** Begin delivering foreground messages + warm taps to the controller. */
    fun start(onMessage: (PushMessage) -> Unit, onTap: (PushMessage) -> Unit)
    fun stop()

    companion object {
        const val CAPABILITY = "push"
        const val CAPABILITY_VERSION = 1
    }
}
```

Serializable data classes (`@Serializable`, lowercase wire enums — same convention as
`NetworkStatus`): `PushToken(value, platform)`, `PushMessage(id, title?, body?, data,
badge?, sound?, launchNotification)`, `NotificationChannel(...)`, `PermissionStatus`,
`PushError(message, code)`.

### `PushController` (emit + cold-launch hold) — mirrors `NetworkStatusController` + `AppLifecycleController`

- Holds the shared `BridgeEventEmitter`.
- `onMessage(msg)` → `emit(MESSAGE, msg)`.
- `onTap(msg)` → `emit(NOTIFICATION_TAP, msg)` (warm).
- `onRegistrationError(err)` → `emit(REGISTRATION_ERROR, err)`.
- `setLaunchNotification(msg)` / `consumeLaunchNotification(): PushMessage?` — **consume-once**,
  copied straight from `AppLifecycleController.setLaunchUrl` / `consumeLaunchUrl` (D2).

### `handlers/push/PushHandlers.kt`

One handler per request method (factory `pushHandlers(provider, controller)` returning the
list, like `networkHandlers`). `PushGetLaunchNotificationHandler` returns
`{ message: <msg|null> }` (always-present, null-safe key — same shape as
`AppGetLaunchUrlHandler`).

### `fakes/FakePushProvider.kt`

Injectable modes, mirroring `FakeNetworkProvider.push(...)`:
`registrationFails: PushError?`, `tokenReturns(token)`, `messageArrives(msg)` (fires the
foreground listener), `tapArrives(msg)` (fires the warm-tap listener), settable
`permission`. Lets `PushControllerTest` + `PushHandlerTest` cover the whole contract with
zero device.

---

## 4. CapsuleActivity wiring (edit) — **moved to Slice 2**

> Deferred from Slice 1: the wiring constructs an `AndroidPushProvider`, which is a Slice-2 artifact.
> Doing it in Slice 1 would need a throwaway no-op provider in `main/`. Build this together with
> `AndroidPushProvider` in Slice 2. Steps below are unchanged.

Mirror the Network block:

1. `capabilities` chain → add `.register(PushProvider.CAPABILITY, PushProvider.CAPABILITY_VERSION)`.
2. Init `pushController = PushController { method, params -> bridge.sendNotification(method, params) }`.
3. Handlers → add `pushHandlers(pushProvider, pushController)`.
4. Lifecycle → `pushProvider.start(onMessage = { pushController.onMessage(it) }, onTap = { pushController.onTap(it) })`; `stop()` on teardown.
5. **Cold tap (Slice 2):** in `onCreate`, if the launch intent carries push extras (set by
   `CapsulePushService` when it posts the tray notification), parse → `pushController.setLaunchNotification(msg)`.
   Reuses the existing `singleTask` + `onNewIntent` path App-lifecycle already added — a warm
   tap arriving via `onNewIntent` routes to `pushController.onTap(msg)`.

---

## 5. WebBridge dev fallback (browser)

Add `push.*` to `web-bridge.ts` so the example runs in `capsule dev` without a device:
- `register()` → resolves a fake token `{ value: 'web-dev-token', platform: 'android' }`.
- channel ops → in-memory list; `checkPermissions`/`requestPermissions` → map the
  `Notification.permission` Web API where present, else `'granted'`.
- `getLaunchNotification()` → `{ message: null }`.
- Expose a dev-only `window.__capsulePushSimulate(msg)` to fire `push.message` /
  `push.notificationTap` from the console (mirrors how online/offline are simulated).
- Declare `push: 1` in the WebBridge capability map so `capabilities.has('push')` matches native.

---

## 6. Slice 2 — Firebase (isolated build-system + CLI surface)

> Only this slice touches the Gradle build and the CLI. Keep it a separate set of commits.

- **`AndroidPushProvider`**: `FirebaseMessaging.getInstance().token` for `register`;
  `NotificationManager` for channels + `removeAllDeliveredNotifications`; Android 13+
  `POST_NOTIFICATIONS` runtime permission for `requestPermissions`.
- **`CapsulePushService : FirebaseMessagingService`** (manifest-registered): `onNewToken` →
  forward to provider's token callback; `onMessageReceived` → if app foreground, deliver to
  the message listener; if background, post a tray notification whose tap intent re-launches
  the Activity with push extras (→ cold/warm tap routing per §4.5). **Messages can arrive
  with no Activity/QuickJS alive — the Service is the entry point, the Activity is not.**
- **Gradle**: add `com.google.firebase:firebase-messaging` to the capsule module +
  `com.google.gms.google-services` plugin. This changes the **AAR build** → stale-AAR rule
  applies (assembleRelease before any `build android`).
- **CLI `sync`**: copy `android.push.googleServicesFile` (from `capsule.config.ts`, per Q19) →
  `.capsule/android/app/google-services.json`. `google-services.json` is app-specific
  (project id / api key / app id) — never bundled in the shell; the developer supplies the
  path. Add config typing + a `capsule doctor` check that warns if `push` is used without it.

---

## 7. iOS (APNs) seam — Phase 4, defined now (D6)

Same `PushProvider` interface. iOS impl: `UNUserNotificationCenter` for permissions/channels
(channels are a no-op — iOS has no channel concept), `registerForRemoteNotifications` +
`application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` → `PushToken{platform:'ios'}`,
`didReceiveRemoteNotification` / `userNotificationCenter(_:didReceive:)` → message + tap.
Cold tap arrives via `launchOptions[.remoteNotification]` → `setLaunchNotification` (the
APNs analogue of the Android launch-intent extras). No third-party SDK — APNs is pure
platform (Q19). Declared in `capsule.config.ts` `ios.capabilities: ['push-notifications']`
(already in [publishing.md](publishing.md)).

---

## 8. Test plan (run ALL tiers at the end)

| Tier | Slice 1 | Slice 2 |
|------|---------|---------|
| core vitest | `push.ts` module shape, method-name wire constants, unsubscribe semantics; WebBridge fallback | — |
| CLI vitest | — | `google-services.json` copy on `sync`; `doctor` warning when path missing |
| Kotlin JVM | `PushControllerTest` (emit MESSAGE/TAP/ERROR; consume-once launch notification), `PushHandlerTest` (each request handler over `FakePushProvider`, incl. modes) | — |
| Instrumented | — | `AndroidPushProviderTest` — channel CRUD against real `NotificationManager`; `tokenLivesOutsideOtaBundleDir` assertion (D5) |
| Device smoke | Push screen renders, register button returns the fake token, console-simulated message/tap update the log | real FCM: send a test message from Firebase console → foreground arrival logs live; background → tray notification → tap cold/warm-routes to the Push screen |

Example screen (`PushScreen.tsx`): register button + token display, permission status +
request button, channel create/list (Android), and a live event log of messages + taps
(cold tap shown via `getLaunchNotification()` on mount, warm via `onNotificationTap`) —
follows the `NetworkScreen` get-then-subscribe pattern. Registry entry:
`{ id: 'push', title: 'Push', icon: '🔔', group: 'Native APIs', Component: PushScreen }`.

---

## 9. Build-order checklist for a fresh session

1. ✅ **Slice 1** — `core/src/push.ts` + index export + WebBridge fallback + `errors.ts` → `pnpm run build` (core).
2. ✅ `PushProvider.kt` (interface + data classes) → `PushController.kt` → `FakePushProvider.kt`
   → `PushHandlers.kt` (+ `BridgeError.PushRegistrationFailed`).
3. ✅ `PushControllerTest.kt` + `PushHandlerTest.kt` → `gradlew test` (JVM, offline — must stay green).
4. ⏭️ **Wire `CapsuleActivity.kt`** — *moved to Slice 2* (needs `AndroidPushProvider`; see §4).
5. ✅ `PushScreen.tsx` + registry entry → core vitest + CLI vitest.
6. **Commit Slice 1** (English Conventional Commits across `capsule` + `examples` + `docs`).
7. **Slice 2** — `AndroidPushProvider.kt` + `CapsulePushService.kt` + **`CapsuleActivity` wiring (§4)**
   + Gradle/`google-services` + CLI `sync` + config typing → `assembleRelease` (stale-AAR rule)
   → `AndroidPushProviderTest.kt` → instrumented + device smoke → commit Slice 2.
