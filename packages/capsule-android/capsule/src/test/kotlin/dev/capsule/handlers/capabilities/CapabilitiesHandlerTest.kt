// Docs: docs/reference/core-api.md
package dev.capsule.handlers.capabilities

import dev.capsule.protocol.CapabilityRegistry
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class CapabilitiesHandlerTest {

    @Test
    fun `returns the registered capability versions`() = runTest {
        val registry = CapabilityRegistry()
            .register("app", 1)
            .register("camera", 2)

        val result = CapabilitiesHandler(registry).handle(kotlinx.serialization.json.JsonObject(emptyMap()))
        val caps = result.jsonObject["capabilities"]!!.jsonObject

        assertEquals(1, caps["app"]!!.jsonPrimitive.int)
        assertEquals(2, caps["camera"]!!.jsonPrimitive.int)
    }

    @Test
    fun `register overwrites a prior version`() {
        val registry = CapabilityRegistry().register("app", 1).register("app", 3)
        assertEquals(3, registry.snapshot()["app"])
    }
}
