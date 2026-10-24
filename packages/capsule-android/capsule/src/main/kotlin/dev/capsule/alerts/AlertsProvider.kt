// Docs: docs/guide/alerts-styling.md
package dev.capsule.alerts

interface AlertsProvider {
    suspend fun show(
        title: String?,
        message: String,
        buttons: List<AlertButton>,
        style: AlertStyle = AlertStyle(),
    ): String
}

data class AlertButton(
    val label: String,
    val role: String = "default",
)

data class AlertStyle(
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
