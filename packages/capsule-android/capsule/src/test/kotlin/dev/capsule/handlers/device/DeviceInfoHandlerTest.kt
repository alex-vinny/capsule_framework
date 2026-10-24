// Docs: docs/reference/core-api.md
package dev.capsule.handlers.device

import dev.capsule.device.DeviceInfo
import dev.capsule.fakes.FakeDeviceInfoProvider
import dev.capsule.fakes.sampleDeviceInfo
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceInfoHandlerTest {

    private fun handler(info: DeviceInfo = sampleDeviceInfo) =
        DeviceInfoHandler(FakeDeviceInfoProvider(info))

    @Test
    fun `returns correct platform and model`() = runTest {
        val result = handler().handle(JsonObject(emptyMap()))
        val info = Json.decodeFromJsonElement<DeviceInfo>(result)

        assertEquals("android", info.platform)
        assertEquals("Test Device", info.model)
        assertEquals("Test Corp", info.manufacturer)
    }

    @Test
    fun `returns os and sdk version`() = runTest {
        val result = handler().handle(JsonObject(emptyMap()))
        val info = Json.decodeFromJsonElement<DeviceInfo>(result)

        assertEquals("14", info.osVersion)
        assertEquals(34, info.sdkVersion)
    }

    @Test
    fun `returns virtual flag`() = runTest {
        val result = handler().handle(JsonObject(emptyMap()))
        val info = Json.decodeFromJsonElement<DeviceInfo>(result)

        assertTrue(info.isVirtual)
    }

    @Test
    fun `returns webview version`() = runTest {
        val result = handler().handle(JsonObject(emptyMap()))
        val info = Json.decodeFromJsonElement<DeviceInfo>(result)

        assertEquals("120.0.6099.144", info.webViewVersion)
    }

    @Test
    fun `handles null webview version`() = runTest {
        val result = handler(sampleDeviceInfo.copy(webViewVersion = null)).handle(JsonObject(emptyMap()))
        val info = Json.decodeFromJsonElement<DeviceInfo>(result)

        assertEquals(null, info.webViewVersion)
    }
}
