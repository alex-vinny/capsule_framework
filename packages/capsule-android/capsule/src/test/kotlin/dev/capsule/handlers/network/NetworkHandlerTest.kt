// Docs: docs/reference/core-api.md
package dev.capsule.handlers.network

import dev.capsule.fakes.FakeNetworkProvider
import dev.capsule.network.ConnectionType
import dev.capsule.network.NetworkStatus
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class NetworkHandlerTest {

    @Test
    fun `getStatus reads the provider's current status`() = runTest {
        val provider = FakeNetworkProvider(NetworkStatus(true, ConnectionType.CELLULAR))
        val result = NetworkGetStatusHandler(provider).handle(JsonObject(emptyMap())).jsonObject

        assertEquals(true, result["connected"]!!.jsonPrimitive.boolean)
        assertEquals("cellular", result["connectionType"]!!.jsonPrimitive.content)
    }

    @Test
    fun `getStatus reflects an offline provider`() = runTest {
        val provider = FakeNetworkProvider(NetworkStatus(false, ConnectionType.NONE))
        val result = NetworkGetStatusHandler(provider).handle(JsonObject(emptyMap())).jsonObject

        assertEquals(false, result["connected"]!!.jsonPrimitive.boolean)
        assertEquals("none", result["connectionType"]!!.jsonPrimitive.content)
    }
}
