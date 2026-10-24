// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

/**
 * Persistent record of launch attempts that have not yet been confirmed healthy.
 *
 * A launch attempt is recorded at the start of [CapsuleRuntime.start]; it is cleared once the
 * web layer signals readiness via [CapsuleRuntime.notifyAppReady]. If the process dies before
 * that signal (a crash), the timestamp survives — so counting recent timestamps reveals a
 * crash loop across process restarts.
 *
 * Implementations must be durable across process death (e.g. SharedPreferences on Android).
 */
interface CrashLog {
    /** Append a launch-attempt timestamp (epoch millis). */
    fun record(timestampMs: Long)

    /** All recorded timestamps, oldest-to-newest is not required. */
    fun timestamps(): List<Long>

    /** Drop all recorded timestamps. */
    fun clear()
}
