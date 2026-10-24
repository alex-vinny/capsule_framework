// Docs: docs/reference/core-api.md
package dev.capsule.handlers.haptics

import dev.capsule.fakes.FakeHapticsProvider
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HapticsHandlerTest {

    private fun handler(): Pair<HapticsHandler, FakeHapticsProvider> {
        val fake = FakeHapticsProvider()
        return HapticsHandler(fake) to fake
    }

    @Test
    fun `vibrates with given style`() = runTest {
        val (h, fake) = handler()
        h.handle(buildJsonObject { put("style", "heavy") })
        assertEquals("heavy", fake.calls.last())
    }

    @Test
    fun `defaults to medium style`() = runTest {
        val (h, fake) = handler()
        h.handle(JsonObject(emptyMap()))
        assertEquals("medium", fake.calls.last())
    }

    @Test
    fun `returns empty object`() = runTest {
        val (h, _) = handler()
        val result = h.handle(JsonObject(emptyMap()))
        assertTrue(result is JsonObject && result.isEmpty())
    }

    @Test
    fun `records each call`() = runTest {
        val (h, fake) = handler()
        h.handle(buildJsonObject { put("style", "light") })
        h.handle(buildJsonObject { put("style", "success") })
        assertEquals(listOf("light", "success"), fake.calls)
    }
}
