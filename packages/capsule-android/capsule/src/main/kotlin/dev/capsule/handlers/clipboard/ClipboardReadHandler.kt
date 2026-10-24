// Docs: docs/reference/core-api.md
package dev.capsule.handlers.clipboard

import dev.capsule.clipboard.ClipboardProvider
import dev.capsule.handlers.BridgeHandler
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.encodeToJsonElement

@Serializable
data class ClipboardReadResult(val value: String?)

class ClipboardReadHandler(
    private val provider: ClipboardProvider,
) : BridgeHandler {

    override val method = "clipboard.read"

    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(ClipboardReadResult(provider.read()))
}
