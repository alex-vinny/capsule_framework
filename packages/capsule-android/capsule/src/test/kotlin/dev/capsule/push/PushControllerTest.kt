// Docs: docs/guide/push-notifications.md
package dev.capsule.push

import dev.capsule.fakes.FakeBridgeEventEmitter
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushControllerTest {

    private fun controller(emitter: FakeBridgeEventEmitter = FakeBridgeEventEmitter()) =
        PushController(emitter) to emitter

    private val msg = PushMessage(id = "m1", title = "Hi", body = "there", data = mapOf("k" to "v"))

    // ── emit ──────────────────────────────────────────────────────────────────────

    @Test
    fun `onMessage emits push_message with the wire-shaped JSON`() {
        val (c, emitter) = controller()

        c.onMessage(msg)

        assertEquals(PushController.MESSAGE, emitter.last!!.method)
        val params = emitter.last!!.params.jsonObject
        assertEquals("m1", params["id"]!!.jsonPrimitive.content)
        assertEquals("Hi", params["title"]!!.jsonPrimitive.content)
        assertEquals("v", params["data"]!!.jsonObject["k"]!!.jsonPrimitive.content)
    }

    @Test
    fun `onTap emits push_notificationTap`() {
        val (c, emitter) = controller()

        c.onTap(msg)

        assertEquals(PushController.NOTIFICATION_TAP, emitter.last!!.method)
        assertEquals("m1", emitter.last!!.params.jsonObject["id"]!!.jsonPrimitive.content)
    }

    @Test
    fun `onRegistrationError emits push_registrationError with message and code`() {
        val (c, emitter) = controller()

        c.onRegistrationError(PushError("token refresh failed"))

        assertEquals(PushController.REGISTRATION_ERROR, emitter.last!!.method)
        val params = emitter.last!!.params.jsonObject
        assertEquals("token refresh failed", params["message"]!!.jsonPrimitive.content)
        assertEquals(6001, params["code"]!!.jsonPrimitive.int)
    }

    // ── launch notification (consume-once, D2) ───────────────────────────────────────

    @Test
    fun `launch notification is returned once then cleared`() {
        val (c, _) = controller()
        c.setLaunchNotification(msg)

        assertEquals(msg, c.consumeLaunchNotification())
        assertNull(c.consumeLaunchNotification())
    }

    @Test
    fun `launch notification is null on a normal launch`() {
        val (c, _) = controller()
        c.setLaunchNotification(null)
        assertNull(c.consumeLaunchNotification())
    }

    @Test
    fun `setLaunchNotification with null does not clear an existing one`() {
        val (c, _) = controller()
        c.setLaunchNotification(msg)
        c.setLaunchNotification(null)
        assertEquals(msg, c.consumeLaunchNotification())
    }
}
