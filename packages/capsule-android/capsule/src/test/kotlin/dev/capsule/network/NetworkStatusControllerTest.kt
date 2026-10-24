// Docs: docs/reference/core-api.md
package dev.capsule.network

import dev.capsule.fakes.FakeBridgeEventEmitter
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class NetworkStatusControllerTest {

    private fun controller(emitter: FakeBridgeEventEmitter = FakeBridgeEventEmitter()) =
        NetworkStatusController(emitter) to emitter

    @Test
    fun `update emits statusChange with the wire-shaped JSON`() {
        val (c, emitter) = controller()

        c.update(NetworkStatus(true, ConnectionType.WIFI))

        assertEquals(NetworkStatusController.STATUS_CHANGE, emitter.last!!.method)
        val params = emitter.last!!.params.jsonObject
        assertEquals(true, params["connected"]!!.jsonPrimitive.boolean)
        assertEquals("wifi", params["connectionType"]!!.jsonPrimitive.content)
    }

    @Test
    fun `repeated identical status does not re-emit`() {
        val (c, emitter) = controller()

        c.update(NetworkStatus(true, ConnectionType.WIFI))
        c.update(NetworkStatus(true, ConnectionType.WIFI))

        assertEquals(1, emitter.emissions.size)
    }

    @Test
    fun `a genuine transition re-emits`() {
        val (c, emitter) = controller()

        c.update(NetworkStatus(true, ConnectionType.WIFI))
        c.update(NetworkStatus(false, ConnectionType.NONE))

        assertEquals(2, emitter.emissions.size)
        val last = emitter.last!!.params.jsonObject
        assertEquals(false, last["connected"]!!.jsonPrimitive.boolean)
        assertEquals("none", last["connectionType"]!!.jsonPrimitive.content)
    }

    @Test
    fun `each transport serializes to its lowercase wire form`() {
        val (c, emitter) = controller()

        c.update(NetworkStatus(true, ConnectionType.CELLULAR))
        c.update(NetworkStatus(true, ConnectionType.ETHERNET))
        c.update(NetworkStatus(true, ConnectionType.UNKNOWN))

        assertEquals(
            listOf("cellular", "ethernet", "unknown"),
            emitter.emissions.map { it.params.jsonObject["connectionType"]!!.jsonPrimitive.content },
        )
    }
}
