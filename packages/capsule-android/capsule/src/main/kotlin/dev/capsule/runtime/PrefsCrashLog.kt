// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

import android.content.SharedPreferences

/**
 * [CrashLog] persisted in [SharedPreferences] so launch-attempt timestamps survive process death —
 * the whole point of crash-loop detection (a crash is, by definition, a process that died).
 *
 * Timestamps are stored as a comma-separated string under [KEY]. The list is bounded to [MAX_KEPT]
 * most-recent entries so a long-lived install can't grow it without limit.
 */
class PrefsCrashLog(
    private val prefs: SharedPreferences,
    private val maxKept: Int = MAX_KEPT,
) : CrashLog {

    override fun record(timestampMs: Long) {
        val next = (timestamps() + timestampMs).takeLast(maxKept)
        prefs.edit().putString(KEY, next.joinToString(",")).apply()
    }

    override fun timestamps(): List<Long> =
        prefs.getString(KEY, null)
            ?.split(",")
            ?.mapNotNull { it.trim().toLongOrNull() }
            ?: emptyList()

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    companion object {
        const val KEY = "launch_attempts"
        const val MAX_KEPT = 10
    }
}
