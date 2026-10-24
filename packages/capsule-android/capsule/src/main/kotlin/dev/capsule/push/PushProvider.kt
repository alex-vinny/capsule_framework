// Docs: docs/guide/push-notifications.md
package dev.capsule.push

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Platform-neutral remote-push capability: register for a token, manage Android
 * notification channels + permissions, and feed foreground messages + warm taps
 * to [dev.capsule.push.PushController]. The Android implementation (Slice 2)
 * wraps `FirebaseMessaging` + `NotificationManager`; the iOS shell (Phase 4)
 * implements this *same* interface with `UNUserNotificationCenter` +
 * `registerForRemoteNotifications`, returning the same [PushToken] shape (just
 * `platform = "ios"`). Keeping the seam at the provider — not the FCM plumbing
 * underneath — is what makes the controller + handlers shared across platforms.
 *
 * Channel ops are Android-only and no-op on iOS (which has no channel concept).
 *
 * The registration token must be persisted **outside** the OTA bundle dirs
 * (`filesDir/bundles`) so a bundle swap never wipes it — see [022 D5]. No
 * persistent state lives in this interface itself; the impl owns that store.
 */
interface PushProvider {
    /** Register for remote push. Async — the token (or error) arrives via the callbacks. */
    fun register(onToken: (PushToken) -> Unit, onError: (PushError) -> Unit)

    fun checkPermissions(): PermissionStatus
    fun requestPermissions(onResult: (PermissionStatus) -> Unit)

    // Android-only channel ops (no-op on iOS).
    fun createChannel(channel: NotificationChannel)
    fun removeChannel(id: String)
    fun listChannels(): List<NotificationChannel>
    fun removeAllDeliveredNotifications()

    /** Begin delivering foreground messages + warm taps to the controller. */
    fun start(onMessage: (PushMessage) -> Unit, onTap: (PushMessage) -> Unit)

    /** Stop delivering. Safe to call when not started. */
    fun stop()

    companion object {
        /** Capability name + native version for OTA gating (see CapabilityRegistry). */
        const val CAPABILITY = "push"
        const val CAPABILITY_VERSION = 1
    }
}

// ─── Wire models (shapes mirror @capsule/core's push types) ───────────────────

/** A registration token. `platform` distinguishes FCM (`android`) from APNs (`ios`). */
@Serializable
data class PushToken(
    val value: String,
    val platform: String,
)

/**
 * A push message as delivered to JS. `data` is the server's custom key-value
 * payload; [launchNotification] is `true` when a tap launched/resumed the app.
 * Optional fields are null-default — kotlinx omits them from the wire, matching
 * the optional `?` properties in `@capsule/core`'s `PushMessage`.
 */
@Serializable
data class PushMessage(
    val id: String,
    val title: String? = null,
    val body: String? = null,
    val data: Map<String, String> = emptyMap(),
    val badge: Int? = null,
    val sound: String? = null,
    val launchNotification: Boolean = false,
)

/** An Android notification channel (API 26+). Mirrors `@capsule/core`'s `NotificationChannel`. */
@Serializable
data class NotificationChannel(
    val id: String,
    val name: String,
    val description: String? = null,
    // Required (no default): the default Json omits default-valued fields, and `importance` must
    // always round-trip to JS, where it is a required property. JS always supplies it on decode.
    val importance: ChannelImportance,
    val sound: String? = null,
    val vibration: Boolean? = null,
    val lights: Boolean? = null,
    val lightColor: String? = null,
)

/**
 * Channel importance. `@SerialName` pins each constant to its lowercase wire form,
 * so kotlinx emits exactly what `@capsule/core`'s `importance` union expects.
 */
@Serializable
enum class ChannelImportance {
    @SerialName("min") MIN,
    @SerialName("low") LOW,
    @SerialName("default") DEFAULT,
    @SerialName("high") HIGH,
    @SerialName("max") MAX,
}

/**
 * Permission status — aligned with the W3C Permissions API and `@capsule/core`'s
 * `PermissionStatus`. Lowercase / kebab-case wire forms via `@SerialName`.
 */
@Serializable
enum class PermissionStatus {
    @SerialName("granted") GRANTED,
    @SerialName("denied") DENIED,
    @SerialName("prompt") PROMPT,
    @SerialName("prompt-with-rationale") PROMPT_WITH_RATIONALE,
}

/**
 * A registration failure. [code] defaults to the canonical
 * `PUSH_REGISTRATION_FAILED` (6001, the 6xxx push range — see `@capsule/core`'s
 * errors.ts) and flows to JS through `push.registrationError`.
 */
@Serializable
data class PushError(
    val message: String,
    val code: Int = REGISTRATION_FAILED_CODE,
) {
    companion object {
        const val REGISTRATION_FAILED_CODE = 6001
    }
}
