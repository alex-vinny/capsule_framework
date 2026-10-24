// Docs: docs/reference/core-api.md
package dev.capsule.handlers.clipboard

import dev.capsule.clipboard.ClipboardProvider
import dev.capsule.handlers.BridgeHandler
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

@Serializable
data class ClipboardWriteParams(val text: String)

class ClipboardWriteHandler(
    private val provider: ClipboardProvider,
) : BridgeHandler {

    override val method = "clipboard.write"

    override suspend fun handle(params: JsonElement): JsonElement {
        val p = Json.decodeFromJsonElement<ClipboardWriteParams>(params)
        provider.write(p.text)
        return JsonObject(emptyMap())
    }
}
