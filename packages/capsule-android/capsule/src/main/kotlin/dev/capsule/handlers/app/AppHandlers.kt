// Docs: docs/reference/core-api.md
package dev.capsule.handlers.app

import dev.capsule.app.AppLifecycleController
import dev.capsule.handlers.BridgeHandler
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

// ─── Wire result models (mirror @capsule/core) ───────────────────────────────

@Serializable data class StateResult(val isActive: Boolean)

// ─── Handlers ────────────────────────────────────────────────────────────────

/** `app.getState` → current foreground state. */
class AppGetStateHandler(private val controller: AppLifecycleController) : BridgeHandler {
    override val method = AppLifecycleController.GET_STATE
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(StateResult(controller.isActive))
}

/**
 * `app.getLaunchUrl` → the cold-launch deep link, consumed once. The `url` key is
 * always present (null when launched normally) — built explicitly because
 * kotlinx omits null-default properties, which would drop the key entirely.
 */
class AppGetLaunchUrlHandler(private val controller: AppLifecycleController) : BridgeHandler {
    override val method = AppLifecycleController.GET_LAUNCH_URL
    override suspend fun handle(params: JsonElement): JsonElement {
        val url = controller.consumeLaunchUrl()
        return buildJsonObject { put("url", url) }
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun appLifecycleHandlers(controller: AppLifecycleController): List<BridgeHandler> =
    listOf(
        AppGetStateHandler(controller),
        AppGetLaunchUrlHandler(controller),
    )
