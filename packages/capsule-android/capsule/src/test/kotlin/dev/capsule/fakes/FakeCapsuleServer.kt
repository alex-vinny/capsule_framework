package dev.capsule.fakes

import dev.capsule.runtime.CapsuleServer
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay

class FakeCapsuleServer(
    override val port: Int = 8_080,
    private val behavior: Behavior = Behavior.Immediate,
) : CapsuleServer {

    sealed interface Behavior {
        /** start() returns immediately — normal happy path. */
        object Immediate : Behavior

        /** start() suspends forever — triggers timeout in CapsuleRuntime. */
        object NeverStarts : Behavior

        /** start() delays [ms] milliseconds then succeeds. */
        data class StartsAfter(val ms: Long) : Behavior

        /**
         * The first [successCount] start() calls succeed; the next call throws.
         * Use to test crash-loop rollback.
         */
        data class CrashesAfter(val successCount: Int = 1) : Behavior
    }

    var startCallCount = 0
    var stopped = false

    override suspend fun start() {
        startCallCount++
        when (val b = behavior) {
            Behavior.Immediate -> Unit
            Behavior.NeverStarts -> awaitCancellation()
            is Behavior.StartsAfter -> delay(b.ms)
            is Behavior.CrashesAfter -> {
                if (startCallCount > b.successCount) {
                    throw RuntimeException("FakeCapsuleServer: crashed after ${b.successCount} successful start(s)")
                }
            }
        }
    }

    override fun stop() {
        stopped = true
    }
}
