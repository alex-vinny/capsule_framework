// Docs: docs/reference/core-api.md
package dev.capsule.handlers.haptics

import dev.capsule.handlers.BridgeHandler
import dev.capsule.haptics.HapticsProvider
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

@Serializable
data class VibrateParams(val style: String = "medium")

class HapticsHandler(
    private val provider: HapticsProvider,
) : BridgeHandler {

    override val method = "haptics.vibrate"

    override suspend fun handle(params: JsonElement): JsonElement {
        val p = Json.decodeFromJsonElement<VibrateParams>(params)
        provider.vibrate(p.style)
        return JsonObject(emptyMap())
    }
}
