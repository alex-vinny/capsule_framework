// Docs: docs/reference/core-api.md
package dev.capsule.handlers.app

import dev.capsule.app.AppLifecycleController
import dev.capsule.fakes.FakeBridgeEventEmitter
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppHandlerTest {

    private fun controller() = AppLifecycleController(FakeBridgeEventEmitter())

    @Test
    fun `getState reports the current foreground state`() = runTest {
        val c = controller().also { it.onBackground() }
        val result = AppGetStateHandler(c).handle(JsonObject(emptyMap()))
        assertEquals(false, result.jsonObject["isActive"]!!.jsonPrimitive.content.toBoolean())
    }

    @Test
    fun `getLaunchUrl returns the url then null on a second call`() = runTest {
        val c = controller().also { it.setLaunchUrl("myapp://x") }
        val handler = AppGetLaunchUrlHandler(c)

        val first = handler.handle(JsonObject(emptyMap()))
        assertEquals("myapp://x", first.jsonObject["url"]!!.jsonPrimitive.content)

        val second = handler.handle(JsonObject(emptyMap()))
        assertTrue(second.jsonObject["url"] is JsonNull)
    }

    @Test
    fun `getLaunchUrl always includes the url key, null when absent`() = runTest {
        val result = AppGetLaunchUrlHandler(controller()).handle(JsonObject(emptyMap()))
        assertTrue(result.jsonObject.containsKey("url"))
        assertTrue(result.jsonObject["url"] is JsonNull)
    }
}
