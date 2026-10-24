package dev.capsule.fakes

import dev.capsule.runtime.CrashLog

/** In-memory [CrashLog] for unit tests. */
class FakeCrashLog(initial: List<Long> = emptyList()) : CrashLog {
    private val entries = initial.toMutableList()
    var clearCount = 0
        private set

    override fun record(timestampMs: Long) {
        entries.add(timestampMs)
    }

    override fun timestamps(): List<Long> = entries.toList()

    override fun clear() {
        clearCount++
        entries.clear()
    }
}
