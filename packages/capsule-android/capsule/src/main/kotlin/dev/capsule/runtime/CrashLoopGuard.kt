// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

/**
 * Detects crash loops after an over-the-air bundle is applied.
 *
 * The contract from `docs/contributing/codesync-internals.md`: if the app crashes [threshold] times within
 * [windowMs] after applying a bundle, the runtime rolls back to the previous known-good bundle.
 *
 * Each launch records a timestamp ([recordLaunchAttempt]) that is cleared only once the web layer
 * reports it loaded successfully ([clear], called from [CapsuleRuntime.notifyAppReady]). A launch
 * that crashes before reporting readiness leaves its timestamp behind; [isCrashLooping] returns
 * true once [threshold] such unconfirmed launches fall within the trailing [windowMs].
 *
 * Pure logic — time comes from the injected [clock], persistence from the injected [log] — so it
 * is fully unit-testable without an Android runtime.
 */
class CrashLoopGuard(
    private val log: CrashLog,
    private val clock: Clock = SystemClock,
    val threshold: Int = 3,
    val windowMs: Long = 60_000L,
) {
    /** Record an unconfirmed launch attempt. Call once at the start of each launch. */
    fun recordLaunchAttempt() {
        log.record(clock.now())
    }

    /** True when [threshold] or more unconfirmed launches occurred within the trailing [windowMs]. */
    fun isCrashLooping(): Boolean {
        val now = clock.now()
        return log.timestamps().count { now - it <= windowMs } >= threshold
    }

    /**
     * Clear the crash record. Called when the app boots healthy (the loop is broken) and again
     * after a rollback (the restored bundle starts with a clean slate).
     */
    fun clear() {
        log.clear()
    }
}
