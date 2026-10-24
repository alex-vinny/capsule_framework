package dev.capsule.fakes

import dev.capsule.protocol.BridgeEventEmitter
import kotlinx.serialization.json.JsonElement

/**
 * Test double for [BridgeEventEmitter]. Records every notification a controller
 * (app lifecycle, network status, …) pushes, so emission logic can be asserted
 * in pure-JVM unit tests without a WebView/bridge.
 */
class FakeBridgeEventEmitter : BridgeEventEmitter {
    data class Emission(val method: String, val params: JsonElement)

    val emissions = mutableListOf<Emission>()

    val methods: List<String> get() = emissions.map { it.method }
    val last: Emission? get() = emissions.lastOrNull()

    override fun emit(method: String, params: JsonElement) {
        emissions += Emission(method, params)
    }
}
