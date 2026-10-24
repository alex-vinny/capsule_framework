// Docs: docs/guide/alerts-styling.md
package dev.capsule.handlers.alerts

import dev.capsule.alerts.AlertButton
import dev.capsule.alerts.AlertStyle
import dev.capsule.alerts.AlertsProvider
import dev.capsule.handlers.BridgeHandler
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put

// ─── Params ───────────────────────────────────────────────────────────────────

@Serializable
data class AlertButtonParams(
    val label: String,
    val role: String = "default",
)

@Serializable
data class AlertStyleParams(
    val accentColor: String? = null,
    val backgroundColor: String? = null,
    val titleColor: String? = null,
    val messageColor: String? = null,
    val titleSize: Float? = null,
    val messageSize: Float? = null,
    val buttonAllCaps: Boolean? = null,
    val cornerRadius: Float? = null,
    val dimAmount: Float? = null,
)

@Serializable
data class AlertsShowParams(
    val message: String,
    val title: String? = null,
    val buttons: List<AlertButtonParams> = emptyList(),
    val style: AlertStyleParams? = null,
)

// ─── Handler ──────────────────────────────────────────────────────────────────

class AlertsShowHandler(private val provider: AlertsProvider) : BridgeHandler {

    override val method = "alerts.show"

    override suspend fun handle(params: JsonElement): JsonElement {
        val p = Json.decodeFromJsonElement<AlertsShowParams>(params)
        val buttons = p.buttons.map { AlertButton(it.label, it.role) }
        val style = p.style?.let {
            AlertStyle(
                accentColor = it.accentColor,
                backgroundColor = it.backgroundColor,
                titleColor = it.titleColor,
                messageColor = it.messageColor,
                titleSize = it.titleSize,
                messageSize = it.messageSize,
                buttonAllCaps = it.buttonAllCaps,
                cornerRadius = it.cornerRadius,
                dimAmount = it.dimAmount,
            )
        } ?: AlertStyle()
        val action = provider.show(p.title, p.message, buttons, style)
        return buildJsonObject { put("action", action) }
    }
}
