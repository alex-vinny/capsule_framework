// Docs: docs/guide/push-notifications.md
package dev.capsule.handlers.push

import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import dev.capsule.push.NotificationChannel
import dev.capsule.push.PermissionStatus
import dev.capsule.push.PushController
import dev.capsule.push.PushProvider
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// ─── Wire param/result models (mirror @capsule/core) ──────────────────────────

@Serializable private data class IdParam(val id: String)
@Serializable private data class ChannelsResult(val channels: List<NotificationChannel>)
@Serializable private data class PermissionsResult(val notifications: PermissionStatus)

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * `push.register` → the platform token. [PushProvider.register] is callback-based
 * (the FCM token arrives asynchronously), so it is bridged into the suspending
 * handler with [suspendCancellableCoroutine]; a registration failure rejects with
 * `PUSH_REGISTRATION_FAILED` (6001), carrying the provider's message as detail.
 */
class PushRegisterHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.REGISTER
    override suspend fun handle(params: JsonElement): JsonElement =
        suspendCancellableCoroutine { cont ->
            provider.register(
                onToken = { cont.resume(Json.encodeToJsonElement(it)) },
                onError = {
                    cont.resumeWithException(
                        CapsuleException(BridgeError.PushRegistrationFailed, it.message)
                    )
                },
            )
        }
}

/** `push.createChannel` → create/update an Android channel. No-op result. */
class PushCreateChannelHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.CREATE_CHANNEL
    override suspend fun handle(params: JsonElement): JsonElement {
        provider.createChannel(Json.decodeFromJsonElement<NotificationChannel>(params))
        return buildJsonObject {}
    }
}

/** `push.removeChannel` → delete a channel by id. No-op result. */
class PushRemoveChannelHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.REMOVE_CHANNEL
    override suspend fun handle(params: JsonElement): JsonElement {
        provider.removeChannel(Json.decodeFromJsonElement<IdParam>(params).id)
        return buildJsonObject {}
    }
}

/** `push.listChannels` → `{ channels: [...] }` (always-present key; `[]` on iOS). */
class PushListChannelsHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.LIST_CHANNELS
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(ChannelsResult(provider.listChannels()))
}

/** `push.removeAllDeliveredNotifications` → clear the app's posted notifications. No-op result. */
class PushRemoveAllDeliveredHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.REMOVE_ALL_DELIVERED
    override suspend fun handle(params: JsonElement): JsonElement {
        provider.removeAllDeliveredNotifications()
        return buildJsonObject {}
    }
}

/** `push.checkPermissions` → `{ notifications: <status> }` without prompting. */
class PushCheckPermissionsHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.CHECK_PERMISSIONS
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(PermissionsResult(provider.checkPermissions()))
}

/**
 * `push.requestPermissions` → prompts, then `{ notifications: <status> }`. Like
 * [PushRegisterHandler], the provider's result is delivered via a callback, so it
 * is bridged into the suspending handler with [suspendCancellableCoroutine].
 */
class PushRequestPermissionsHandler(private val provider: PushProvider) : BridgeHandler {
    override val method = PushController.REQUEST_PERMISSIONS
    override suspend fun handle(params: JsonElement): JsonElement =
        suspendCancellableCoroutine { cont ->
            provider.requestPermissions { cont.resume(Json.encodeToJsonElement(PermissionsResult(it))) }
        }
}

/**
 * `push.getLaunchNotification` → the cold-launch tap, consumed once. The `message`
 * key is always present (null on a normal launch) — built explicitly because
 * kotlinx omits null-default properties, which would drop the key (same shape as
 * [dev.capsule.handlers.app.AppGetLaunchUrlHandler]).
 */
class PushGetLaunchNotificationHandler(private val controller: PushController) : BridgeHandler {
    override val method = PushController.GET_LAUNCH_NOTIFICATION
    override suspend fun handle(params: JsonElement): JsonElement {
        val message = controller.consumeLaunchNotification()
        return buildJsonObject {
            put("message", if (message == null) JsonNull else Json.encodeToJsonElement(message))
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun pushHandlers(provider: PushProvider, controller: PushController): List<BridgeHandler> =
    listOf(
        PushRegisterHandler(provider),
        PushCreateChannelHandler(provider),
        PushRemoveChannelHandler(provider),
        PushListChannelsHandler(provider),
        PushRemoveAllDeliveredHandler(provider),
        PushCheckPermissionsHandler(provider),
        PushRequestPermissionsHandler(provider),
        PushGetLaunchNotificationHandler(controller),
    )
