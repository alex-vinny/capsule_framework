// Docs: docs/contributing/workflows/add-native-api/CONTEXT.md, docs/concepts/architecture.md
package dev.capsule.handlers

import dev.capsule.protocol.BridgeError
import kotlinx.serialization.json.JsonElement

interface BridgeHandler {
    val method: String
    suspend fun handle(params: JsonElement): JsonElement
    fun register(registry: MutableMap<String, BridgeHandler>) {
        registry[method] = this
    }
}

class CapsuleException(
    val error: BridgeError,
    val detail: String? = null
) : Exception(error.message)
