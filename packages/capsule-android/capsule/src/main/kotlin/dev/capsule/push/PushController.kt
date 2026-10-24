// Docs: docs/guide/push-notifications.md
package dev.capsule.push

import dev.capsule.protocol.BridgeEventEmitter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

/**
 * Platform-neutral push event logic, parallel to
 * [dev.capsule.network.NetworkStatusController] and
 * [dev.capsule.app.AppLifecycleController]: it owns no Android types, so it is
 * fully unit-testable on the JVM with a fake [BridgeEventEmitter]. The Android
 * shell (Slice 2) drives it from a `FirebaseMessagingService`; the iOS shell
 * (Phase 4) drives the *same* class from `UNUserNotificationCenterDelegate`.
 *
 * Two jobs:
 *  - **emit** foreground messages, warm taps, and registration errors to JS as
 *    `push.message` / `push.notificationTap` / `push.registrationError`.
 *  - **hold the cold-launch tap** — [setLaunchNotification] / [consumeLaunchNotification]
 *    are consume-once, copied from `AppLifecycleController.setLaunchUrl` (022 D2),
 *    so a late-mounting JS handler can still pull the tap that launched the app.
 *
 * Method names mirror `@capsule/core`'s `PushMethods`. The launch notification is
 * held only in memory — no persisted user data — so the Phase-5 "persist outside
 * the OTA bundle dirs" constraint is satisfied trivially here.
 */
class PushController(private val emitter: BridgeEventEmitter) {

    private var launchNotification: PushMessage? = null

    /** A push arrived while the app is foregrounded. Emits `push.message`. */
    fun onMessage(message: PushMessage) {
        emitter.emit(MESSAGE, Json.encodeToJsonElement(message))
    }

    /** The user tapped a notification while the app was running/backgrounded (warm). Emits `push.notificationTap`. */
    fun onTap(message: PushMessage) {
        emitter.emit(NOTIFICATION_TAP, Json.encodeToJsonElement(message))
    }

    /**
     * An async registration failure (e.g. FCM token refresh). Emits `push.registrationError`.
     * Built explicitly so both keys are always present: the default `Json` omits default-valued
     * fields, which would drop `code` when it equals its default — but JS's `onRegistrationError`
     * requires `{ message, code }`.
     */
    fun onRegistrationError(error: PushError) {
        emitter.emit(
            REGISTRATION_ERROR,
            buildJsonObject {
                put("message", error.message)
                put("code", error.code)
            },
        )
    }

    /** Seed the tap the app was cold-launched with (consumed once via [consumeLaunchNotification]). */
    fun setLaunchNotification(message: PushMessage?) {
        if (message != null) launchNotification = message
    }

    /** Returns the cold-launch tap and clears it, so a second read yields null. */
    fun consumeLaunchNotification(): PushMessage? =
        launchNotification.also { launchNotification = null }

    companion object {
        const val REGISTER = "push.register"
        const val CREATE_CHANNEL = "push.createChannel"
        const val REMOVE_CHANNEL = "push.removeChannel"
        const val LIST_CHANNELS = "push.listChannels"
        const val REMOVE_ALL_DELIVERED = "push.removeAllDeliveredNotifications"
        const val CHECK_PERMISSIONS = "push.checkPermissions"
        const val REQUEST_PERMISSIONS = "push.requestPermissions"
        const val GET_LAUNCH_NOTIFICATION = "push.getLaunchNotification"

        const val MESSAGE = "push.message"
        const val NOTIFICATION_TAP = "push.notificationTap"
        const val REGISTRATION_ERROR = "push.registrationError"
    }
}
