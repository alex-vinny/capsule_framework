// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

import dev.capsule.fakes.FakeClock
import dev.capsule.fakes.FakeCrashLog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrashLoopGuardTest {

    private fun guard(
        log: FakeCrashLog = FakeCrashLog(),
        clock: FakeClock = FakeClock(),
        threshold: Int = 3,
        windowMs: Long = 60_000L,
    ) = CrashLoopGuard(log, clock, threshold, windowMs) to clock

    @Test fun `no launches is not a crash loop`() {
        val (g, _) = guard()
        assertFalse(g.isCrashLooping())
    }

    @Test fun `fewer than threshold launches is not a crash loop`() {
        val (g, clock) = guard()
        g.recordLaunchAttempt(); clock.advance(1_000)
        g.recordLaunchAttempt()
        assertFalse(g.isCrashLooping())
    }

    @Test fun `threshold launches within window is a crash loop`() {
        val (g, clock) = guard()
        g.recordLaunchAttempt(); clock.advance(1_000)
        g.recordLaunchAttempt(); clock.advance(1_000)
        g.recordLaunchAttempt()
        assertTrue(g.isCrashLooping())
    }

    @Test fun `launches spread beyond the window are not a crash loop`() {
        val (g, clock) = guard()
        g.recordLaunchAttempt()        // t=0
        clock.advance(30_000)
        g.recordLaunchAttempt()        // t=30s
        clock.advance(40_000)          // t=70s — first attempt now outside 60s window
        g.recordLaunchAttempt()        // t=70s
        // Only the t=30s and t=70s attempts are within the trailing 60s → 2 < 3.
        assertFalse(g.isCrashLooping())
    }

    @Test fun `old crashes age out of the window`() {
        val (g, clock) = guard()
        repeat(3) { g.recordLaunchAttempt() } // 3 at t=0 → looping
        assertTrue(g.isCrashLooping())
        clock.advance(60_001)                 // all 3 now older than the window
        assertFalse(g.isCrashLooping())
    }

    @Test fun `clear resets the crash record`() {
        val (g, _) = guard()
        repeat(3) { g.recordLaunchAttempt() }
        assertTrue(g.isCrashLooping())
        g.clear()
        assertFalse(g.isCrashLooping())
    }

    @Test fun `custom threshold is honored`() {
        val (g, _) = guard(threshold = 2)
        g.recordLaunchAttempt()
        assertFalse(g.isCrashLooping())
        g.recordLaunchAttempt()
        assertTrue(g.isCrashLooping())
    }

    @Test fun `boundary timestamp exactly at window edge still counts`() {
        val log = FakeCrashLog()
        val clock = FakeClock(nowMs = 60_000)
        val g = CrashLoopGuard(log, clock, threshold = 1, windowMs = 60_000L)
        log.record(0) // exactly windowMs ago
        assertTrue(g.isCrashLooping())
    }

    @Test fun `defaults are 3 crashes in 60 seconds`() {
        val g = CrashLoopGuard(FakeCrashLog())
        assertEquals(3, g.threshold)
        assertEquals(60_000L, g.windowMs)
    }
}
