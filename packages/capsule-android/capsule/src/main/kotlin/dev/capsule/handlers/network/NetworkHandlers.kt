// Docs: docs/reference/core-api.md
package dev.capsule.handlers.network

import dev.capsule.handlers.BridgeHandler
import dev.capsule.network.NetworkProvider
import dev.capsule.network.NetworkStatusController
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.encodeToJsonElement

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * `network.getStatus` → the provider's live reachability snapshot (read on every
 * call, like [dev.capsule.handlers.geolocation.GeolocationHandler]). The change
 * feed is delivered separately as `network.statusChange` notifications.
 */
class NetworkGetStatusHandler(private val provider: NetworkProvider) : BridgeHandler {
    override val method = NetworkStatusController.GET_STATUS
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(provider.current())
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun networkHandlers(provider: NetworkProvider): List<BridgeHandler> =
    listOf(NetworkGetStatusHandler(provider))
