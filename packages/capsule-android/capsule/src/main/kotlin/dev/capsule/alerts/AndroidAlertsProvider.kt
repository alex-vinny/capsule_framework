// Docs: docs/guide/alerts-styling.md
package dev.capsule.alerts

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class AndroidAlertsProvider(private val activity: Activity) : AlertsProvider {

    override suspend fun show(
        title: String?,
        message: String,
        buttons: List<AlertButton>,
        style: AlertStyle,
    ): String = suspendCancellableCoroutine { cont ->
        val effective = buttons.ifEmpty { listOf(AlertButton("OK", "default")) }

        // Slot assignment by role
        val cancelBtn      = effective.firstOrNull { it.role == "cancel" }
        val destructiveBtn = effective.firstOrNull { it.role == "destructive" }
        val defaultBtns    = effective.filter { it.role == "default" }

        // positive → first default, then destructive, then whatever remains
        val positive = defaultBtns.firstOrNull() ?: destructiveBtn ?: effective.first()
        // negative → cancel only (destructive is already positive if no default existed)
        val negative = cancelBtn
        // neutral → whatever wasn't assigned to positive or negative
        val remaining = effective.filter { it != positive && it != negative }
        val neutral = remaining.firstOrNull()

        val builder = AlertDialog.Builder(activity)
        title?.let { builder.setTitle(it) }
        builder.setMessage(message)
        builder.setCancelable(false)

        builder.setPositiveButton(positive.label) { _, _ ->
            if (cont.isActive) cont.resume(positive.label)
        }
        negative?.let { btn ->
            builder.setNegativeButton(btn.label) { _, _ ->
                if (cont.isActive) cont.resume(btn.label)
            }
        }
        neutral?.let { btn ->
            builder.setNeutralButton(btn.label) { _, _ ->
                if (cont.isActive) cont.resume(btn.label)
            }
        }

        val dialog = builder.create()
        cont.invokeOnCancellation { dialog.dismiss() }
        dialog.show()
        applyStyle(dialog, style)
    }

    private fun applyStyle(dialog: AlertDialog, style: AlertStyle) {
        val buttons = listOf(AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE, AlertDialog.BUTTON_NEUTRAL)

        // Accent color — all button slots
        style.accentColor?.let { hex ->
            parseColor(hex)?.let { color ->
                buttons.forEach { slot -> dialog.getButton(slot)?.setTextColor(color) }
            }
        }

        // Button all-caps
        style.buttonAllCaps?.let { allCaps ->
            buttons.forEach { slot -> dialog.getButton(slot)?.isAllCaps = allCaps }
        }

        // Background + corner radius — build a GradientDrawable when either is set
        if (style.backgroundColor != null || style.cornerRadius != null) {
            val bgColor = style.backgroundColor?.let { parseColor(it) } ?: Color.WHITE
            val density = activity.resources.displayMetrics.density
            val radius  = (style.cornerRadius ?: 0f) * density
            val drawable = GradientDrawable().apply {
                setColor(bgColor)
                cornerRadius = radius
            }
            dialog.window?.setBackgroundDrawable(drawable)
        }

        // Backdrop dim amount (clamped to [0, 1])
        style.dimAmount?.let { amount ->
            dialog.window?.setDimAmount(amount.coerceIn(0f, 1f))
        }

        // Title
        dialog.findViewById<TextView>(android.R.id.title)?.let { tv ->
            style.titleColor?.let { hex -> parseColor(hex)?.let { tv.setTextColor(it) } }
            style.titleSize?.let { tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, it) }
        }

        // Message
        dialog.findViewById<TextView>(android.R.id.message)?.let { tv ->
            style.messageColor?.let { hex -> parseColor(hex)?.let { tv.setTextColor(it) } }
            style.messageSize?.let { tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, it) }
        }
    }

    private fun parseColor(hex: String): Int? = try {
        Color.parseColor(hex)
    } catch (_: IllegalArgumentException) {
        null
    }
}
