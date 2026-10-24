package dev.capsule.fakes

import dev.capsule.runtime.Clock

/** Test clock whose time is set explicitly. */
class FakeClock(var nowMs: Long = 0L) : Clock {
    override fun now(): Long = nowMs

    /** Advance the clock by [ms] and return the new time. */
    fun advance(ms: Long): Long {
        nowMs += ms
        return nowMs
    }
}
