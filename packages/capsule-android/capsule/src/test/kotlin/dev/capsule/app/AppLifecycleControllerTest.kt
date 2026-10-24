// Docs: docs/reference/core-api.md
package dev.capsule.app

import dev.capsule.fakes.FakeBridgeEventEmitter
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLifecycleControllerTest {

    private fun controller(emitter: FakeBridgeEventEmitter = FakeBridgeEventEmitter()) =
        AppLifecycleController(emitter) to emitter

    // ── state ──────────────────────────────────────────────────────────────────

    @Test
    fun `starts active`() {
        val (c, _) = controller()
        assertTrue(c.isActive)
    }

    @Test
    fun `onBackground then onForeground emit stateChange with the new value`() {
        val (c, emitter) = controller()

        c.onBackground()
        c.onForeground()

        assertEquals(
            listOf(AppLifecycleController.STATE_CHANGE, AppLifecycleController.STATE_CHANGE),
            emitter.methods,
        )
        assertFalse(emitter.emissions[0].params.jsonObject["isActive"]!!.jsonPrimitive.boolean)
        assertTrue(emitter.emissions[1].params.jsonObject["isActive"]!!.jsonPrimitive.boolean)
        assertTrue(c.isActive)
    }

    @Test
    fun `repeated same-state transitions do not re-emit`() {
        val (c, emitter) = controller()

        c.onForeground() // already active — no change
        c.onBackground()
        c.onBackground() // already background — no change

        assertEquals(1, emitter.emissions.size)
        assertFalse(c.isActive)
    }

    // ── launch url (consume-once) ────────────────────────────────────────────────

    @Test
    fun `launch url is returned once then cleared`() {
        val (c, _) = controller()
        c.setLaunchUrl("myapp://order/42")

        assertEquals("myapp://order/42", c.consumeLaunchUrl())
        assertNull(c.consumeLaunchUrl())
    }

    @Test
    fun `launch url is null on a normal launch`() {
        val (c, _) = controller()
        c.setLaunchUrl(null)
        assertNull(c.consumeLaunchUrl())
    }

    // ── warm deep link ────────────────────────────────────────────────────────────

    @Test
    fun `onNewUrl emits urlOpen with the url`() {
        val (c, emitter) = controller()

        c.onNewUrl("https://acme.com/invite/abc")

        assertEquals(AppLifecycleController.URL_OPEN, emitter.last!!.method)
        assertEquals(
            "https://acme.com/invite/abc",
            emitter.last!!.params.jsonObject["url"]!!.jsonPrimitive.content,
        )
    }
}
