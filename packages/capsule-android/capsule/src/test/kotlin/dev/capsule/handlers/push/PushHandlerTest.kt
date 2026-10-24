// Docs: docs/guide/push-notifications.md
package dev.capsule.handlers.push

import dev.capsule.fakes.FakePushProvider
import dev.capsule.handlers.CapsuleException
import dev.capsule.push.ChannelImportance
import dev.capsule.push.NotificationChannel
import dev.capsule.push.PermissionStatus
import dev.capsule.push.PushController
import dev.capsule.push.PushError
import dev.capsule.push.PushMessage
import dev.capsule.push.PushToken
import dev.capsule.fakes.FakeBridgeEventEmitter
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class PushHandlerTest {

    private val empty = JsonObject(emptyMap())

    // ── register ──────────────────────────────────────────────────────────────────

    @Test
    fun `register returns the platform token`() = runTest {
        val provider = FakePushProvider(token = PushToken("fcm-xyz", "android"))
        val result = PushRegisterHandler(provider).handle(empty).jsonObject

        assertEquals("fcm-xyz", result["value"]!!.jsonPrimitive.content)
        assertEquals("android", result["platform"]!!.jsonPrimitive.content)
    }

    @Test
    fun `register failure rejects with PUSH_REGISTRATION_FAILED`() = runTest {
        val provider = FakePushProvider(registrationFails = PushError("fcm unavailable"))
        try {
            PushRegisterHandler(provider).handle(empty)
            fail("expected CapsuleException")
        } catch (e: CapsuleException) {
            assertEquals(6001, e.error.code)
            assertEquals("PUSH_REGISTRATION_FAILED", e.error.message)
            assertEquals("fcm unavailable", e.detail)
        }
    }

    // ── channels ────────────────────────────────────────────────────────────────────

    @Test
    fun `create then list returns the channel in wire shape`() = runTest {
        val provider = FakePushProvider()
        val channel = NotificationChannel(id = "chat", name = "Chat", importance = ChannelImportance.HIGH)
        PushCreateChannelHandler(provider).handle(Json.encodeToJsonElement(channel))

        val result = PushListChannelsHandler(provider).handle(empty).jsonObject
        val channels = result["channels"]!!.jsonArray
        assertEquals(1, channels.size)
        assertEquals("chat", channels[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals("high", channels[0].jsonObject["importance"]!!.jsonPrimitive.content)
    }

    @Test
    fun `removeChannel deletes by id`() = runTest {
        val provider = FakePushProvider()
        provider.createChannel(
            NotificationChannel(id = "chat", name = "Chat", importance = ChannelImportance.DEFAULT)
        )

        PushRemoveChannelHandler(provider).handle(buildJsonObject { put("id", "chat") })

        val result = PushListChannelsHandler(provider).handle(empty).jsonObject
        assertEquals(0, result["channels"]!!.jsonArray.size)
    }

    @Test
    fun `removeAllDeliveredNotifications calls the provider`() = runTest {
        val provider = FakePushProvider()
        PushRemoveAllDeliveredHandler(provider).handle(empty)
        assertTrue(provider.removedAllDelivered)
    }

    // ── permissions ──────────────────────────────────────────────────────────────────

    @Test
    fun `checkPermissions reports the provider status`() = runTest {
        val provider = FakePushProvider(permission = PermissionStatus.DENIED)
        val result = PushCheckPermissionsHandler(provider).handle(empty).jsonObject
        assertEquals("denied", result["notifications"]!!.jsonPrimitive.content)
    }

    @Test
    fun `requestPermissions resolves the resulting status`() = runTest {
        val provider = FakePushProvider(permission = PermissionStatus.GRANTED)
        val result = PushRequestPermissionsHandler(provider).handle(empty).jsonObject
        assertEquals("granted", result["notifications"]!!.jsonPrimitive.content)
    }

    // ── launch notification ──────────────────────────────────────────────────────────

    @Test
    fun `getLaunchNotification returns the held message then null`() = runTest {
        val controller = PushController(FakeBridgeEventEmitter())
        controller.setLaunchNotification(PushMessage(id = "m1", title = "Tapped"))
        val handler = PushGetLaunchNotificationHandler(controller)

        val first = handler.handle(empty).jsonObject
        assertEquals("m1", first["message"]!!.jsonObject["id"]!!.jsonPrimitive.content)

        val second = handler.handle(empty).jsonObject
        assertEquals(JsonNull, second["message"])
    }

    @Test
    fun `getLaunchNotification returns message null on a normal launch`() = runTest {
        val controller = PushController(FakeBridgeEventEmitter())
        val result = PushGetLaunchNotificationHandler(controller).handle(empty).jsonObject
        assertEquals(JsonNull, result["message"])
    }
}
