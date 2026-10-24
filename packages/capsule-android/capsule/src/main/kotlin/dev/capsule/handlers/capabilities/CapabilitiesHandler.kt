// Docs: docs/reference/core-api.md
package dev.capsule.handlers.capabilities

import dev.capsule.handlers.BridgeHandler
import dev.capsule.protocol.CapabilityRegistry
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * `capsule.getCapabilities` → `{ capabilities: { <name>: <version>, ... } }`.
 * Answers the aggregate native-capability map for OTA gating (mirrors
 * `@capsule/core`'s `CapabilitiesModule`).
 */
class CapabilitiesHandler(private val registry: CapabilityRegistry) : BridgeHandler {
    override val method = "capsule.getCapabilities"
    override suspend fun handle(params: JsonElement): JsonElement =
        buildJsonObject {
            put(
                "capabilities",
                JsonObject(registry.snapshot().mapValues { JsonPrimitive(it.value) }),
            )
        }
}
