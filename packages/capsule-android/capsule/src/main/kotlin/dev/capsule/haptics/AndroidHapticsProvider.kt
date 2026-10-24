// Docs: docs/reference/core-api.md
package dev.capsule.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class AndroidHapticsProvider(private val context: Context) : HapticsProvider {

    override fun vibrate(style: String) {
        val vibrator = resolveVibrator()
        if (!vibrator.hasVibrator()) return

        if (Build.VERSION.SDK_INT >= 29) {
            val effectId =
                when (style) {
                    "light", "selection" -> VibrationEffect.EFFECT_TICK
                    "heavy" -> VibrationEffect.EFFECT_HEAVY_CLICK
                    "success" -> VibrationEffect.EFFECT_DOUBLE_CLICK
                    else -> VibrationEffect.EFFECT_CLICK // medium, warning, error
                }
            vibrator.vibrate(VibrationEffect.createPredefined(effectId))
        } else if (Build.VERSION.SDK_INT >= 26) {
            val (duration, amplitude) =
                when (style) {
                    "light", "selection" -> 30L to 40
                    "heavy", "error" -> 80L to VibrationEffect.DEFAULT_AMPLITUDE
                    "success" -> 50L to 180
                    else -> 50L to 128 // medium, warning
                }
            vibrator.vibrate(VibrationEffect.createOneShot(duration, amplitude))
        } else {
            val duration =
                when (style) {
                    "light", "selection" -> 30L
                    "heavy", "error" -> 80L
                    else -> 50L
                }
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
        }
    }

    private fun resolveVibrator(): Vibrator =
        if (Build.VERSION.SDK_INT >= 31) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager)
                .defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
}
