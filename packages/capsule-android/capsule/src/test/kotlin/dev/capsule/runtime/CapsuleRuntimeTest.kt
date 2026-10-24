package dev.capsule.runtime

import dev.capsule.fakes.FakeAppNavigator
import dev.capsule.fakes.FakeBundleStore
import dev.capsule.fakes.FakeCapsuleServer
import dev.capsule.fakes.FakeCapsuleServer.Behavior
import dev.capsule.fakes.FakeClock
import dev.capsule.fakes.FakeCrashLog
import dev.capsule.fakes.FakeQuickJSBridge
import dev.capsule.fakes.FakeQuickJSEngine
import dev.capsule.fakes.FakeSplashController
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapsuleRuntimeTest {

    private fun runtime(
        server: FakeCapsuleServer = FakeCapsuleServer(),
        engine: FakeQuickJSEngine = FakeQuickJSEngine(),
        splash: FakeSplashController = FakeSplashController(),
        navigator: FakeAppNavigator = FakeAppNavigator(),
        bridge: FakeQuickJSBridge? = null,
        timeoutMs: Long = 1_000,
    ) = CapsuleRuntime(server, engine, splash, navigator, quickJsBridge = bridge, timeoutMs = timeoutMs)
        .let { rt -> RuntimeFixture(rt, server, engine, splash, navigator) }

    data class RuntimeFixture(
        val runtime: CapsuleRuntime,
        val server: FakeCapsuleServer,
        val engine: FakeQuickJSEngine,
        val splash: FakeSplashController,
        val navigator: FakeAppNavigator,
    )

    // ── Happy path ────────────────────────────────────────────────────────────

    @Test fun `start shows splash`() = runTest {
        val (rt, _, _, splash) = runtime()
        rt.start()
        assertTrue(splash.events.contains("show"))
    }

    @Test fun `start hides splash after server binds`() = runTest {
        val (rt, _, _, splash) = runtime()
        rt.start()
        assertEquals(listOf("show", "hide"), splash.events)
    }

    @Test fun `start navigates to server url`() = runTest {
        val (rt, server, _, _, navigator) = runtime(server = FakeCapsuleServer(port = 52_000))
        rt.start()
        assertEquals("http://127.0.0.1:52000/", navigator.navigations.single())
    }

    @Test fun `navigation happens before splash hides`() = runTest {
        val events = mutableListOf<String>()
        val splash = object : SplashController {
            override fun show() { events.add("show") }
            override fun hide() { events.add("hide") }
        }
        val navigator = object : AppNavigator {
            override fun navigateTo(url: String) { events.add("navigate:$url") }
        }
        CapsuleRuntime(
            server = FakeCapsuleServer(),
            jsEngine = FakeQuickJSEngine(),
            splash = splash,
            navigator = navigator,
        ).start()
        assertEquals(listOf("show", "navigate:http://127.0.0.1:8080/", "hide"), events)
    }

    @OptIn(ExperimentalCoroutinesApi::class) // runCurrent() — drive virtual time manually
    @Test fun `splash stays up until the app reports ready`() = runTest {
        val splash = FakeSplashController()
        val rt = CapsuleRuntime(
            server = FakeCapsuleServer(),
            jsEngine = FakeQuickJSEngine(),
            splash = splash,
            navigator = FakeAppNavigator(),
        )
        // Drive start() up to the app-ready await without skipping virtual time to the fallback.
        val job = launch { rt.start() }
        runCurrent()
        assertEquals("splash must remain shown until ready", listOf("show"), splash.events)

        rt.notifyAppReady()
        runCurrent()
        assertEquals(listOf("show", "hide"), splash.events)
        job.join()
    }

    @Test fun `start calls server start once`() = runTest {
        val (rt, server) = runtime()
        rt.start()
        assertEquals(1, server.startCallCount)
    }

    // ── stop ─────────────────────────────────────────────────────────────────

    @Test fun `stop calls server stop`() = runTest {
        val (rt, server) = runtime()
        rt.start()
        rt.stop()
        assertTrue(server.stopped)
    }

    @Test fun `stop without start still calls server stop`() {
        val (rt, server) = runtime()
        rt.stop()
        assertTrue(server.stopped)
    }

    // ── Timeout ───────────────────────────────────────────────────────────────

    @Test fun `start throws TimeoutCancellationException when server never starts`() = runTest {
        val (rt) = runtime(
            server = FakeCapsuleServer(behavior = Behavior.NeverStarts),
            timeoutMs = 100,
        )
        var threw = false
        try {
            rt.start()
        } catch (e: TimeoutCancellationException) {
            threw = true
        }
        assertTrue("expected TimeoutCancellationException", threw)
    }

    @Test fun `navigator is not called when server times out`() = runTest {
        val (rt, _, _, _, navigator) = runtime(
            server = FakeCapsuleServer(behavior = Behavior.NeverStarts),
            timeoutMs = 100,
        )
        try { rt.start() } catch (_: TimeoutCancellationException) {}
        assertTrue(navigator.navigations.isEmpty())
    }

    @Test fun `splash show is called even when server times out`() = runTest {
        val (rt, _, _, splash) = runtime(
            server = FakeCapsuleServer(behavior = Behavior.NeverStarts),
            timeoutMs = 100,
        )
        try { rt.start() } catch (_: TimeoutCancellationException) {}
        assertTrue(splash.events.contains("show"))
    }

    // ── CrashesAfter ──────────────────────────────────────────────────────────

    @Test fun `server that crashes after 1 success throws on second start`() = runTest {
        val server = FakeCapsuleServer(behavior = Behavior.CrashesAfter(successCount = 1))
        val (rt) = runtime(server = server)
        rt.start() // first call — succeeds
        rt.stop()

        var threw = false
        try {
            rt.start() // second call — crashes
        } catch (e: RuntimeException) {
            threw = true
        }
        assertTrue(threw)
        assertEquals(2, server.startCallCount)
    }

    // ── Delayed start ─────────────────────────────────────────────────────────

    @Test fun `start succeeds when server starts within timeout`() = runTest {
        val (rt, _, _, splash) = runtime(
            server = FakeCapsuleServer(behavior = Behavior.StartsAfter(ms = 50)),
            timeoutMs = 500,
        )
        rt.start()
        assertEquals(listOf("show", "hide"), splash.events)
    }

    @Test fun `start fails when server exceeds timeout`() = runTest {
        val (rt) = runtime(
            server = FakeCapsuleServer(behavior = Behavior.StartsAfter(ms = 500)),
            timeoutMs = 100,
        )
        var threw = false
        try { rt.start() } catch (_: TimeoutCancellationException) { threw = true }
        assertTrue(threw)
    }

    // ── QuickJS bridge ────────────────────────────────────────────────────────

    @Test fun `start loads the JS bridge when one is provided`() = runTest {
        val bridge = FakeQuickJSBridge()
        val (rt) = runtime(bridge = bridge)
        rt.start()
        assertEquals(1, bridge.loadCallCount)
    }

    @Test fun `start does not require a JS bridge`() = runTest {
        val (rt) = runtime(bridge = null)
        rt.start() // must not throw
    }

    // ── Crash-loop rollback (Step 7) ───────────────────────────────────────────

    /** CapsuleRuntime subclass that records onRollback() invocations for assertions. */
    private class RecordingRuntime(
        server: CapsuleServer,
        crashGuard: CrashLoopGuard,
        bundleStore: BundleStore,
    ) : CapsuleRuntime(
        server = server,
        jsEngine = FakeQuickJSEngine(),
        splash = FakeSplashController(),
        navigator = FakeAppNavigator(),
        bundleStore = bundleStore,
        crashGuard = crashGuard,
        timeoutMs = 1_000,
    ) {
        var rollbackCount = 0
        override fun onRollback() { rollbackCount++ }
    }

    @Test fun `start records a launch attempt`() = runTest {
        val log = FakeCrashLog()
        val guard = CrashLoopGuard(log, FakeClock())
        val rt = RecordingRuntime(FakeCapsuleServer(), guard, FakeBundleStore())
        rt.start()
        assertEquals(1, log.timestamps().size)
    }

    @Test fun `healthy boot is not rolled back`() = runTest {
        val store = FakeBundleStore(hasPrevious = true)
        val guard = CrashLoopGuard(FakeCrashLog(), FakeClock())
        val rt = RecordingRuntime(FakeCapsuleServer(), guard, store)
        rt.start()
        assertEquals(0, store.rollbackCount)
        assertEquals(0, rt.rollbackCount)
    }

    @Test fun `notifyAppReady clears the crash record`() = runTest {
        val log = FakeCrashLog()
        val guard = CrashLoopGuard(log, FakeClock())
        val rt = RecordingRuntime(FakeCapsuleServer(), guard, FakeBundleStore())
        rt.start()
        assertTrue(log.timestamps().isNotEmpty())
        rt.notifyAppReady()
        assertTrue(log.timestamps().isEmpty())
    }

    @Test fun `crash loop with a previous bundle rolls back before booting`() = runTest {
        val clock = FakeClock()
        // Three unconfirmed launches already recorded within the window → looping.
        val log = FakeCrashLog(initial = listOf(0L, 1_000L, 2_000L))
        val guard = CrashLoopGuard(log, clock.also { it.nowMs = 3_000L })
        val store = FakeBundleStore(hasPrevious = true)
        val rt = RecordingRuntime(FakeCapsuleServer(), guard, store)

        rt.start()

        assertEquals(1, store.rollbackCount)
        assertEquals(1, rt.rollbackCount)
        // Log was cleared by the rollback, then this launch's attempt was recorded → exactly 1.
        assertEquals(1, log.timestamps().size)
    }

    @Test fun `crash loop without a previous bundle does not roll back`() = runTest {
        val log = FakeCrashLog(initial = listOf(0L, 1_000L, 2_000L))
        val guard = CrashLoopGuard(log, FakeClock(nowMs = 3_000L))
        val store = FakeBundleStore(hasPrevious = false)
        val rt = RecordingRuntime(FakeCapsuleServer(), guard, store)

        rt.start() // boots anyway — nothing to roll back to

        assertEquals(0, store.rollbackCount)
        assertEquals(0, rt.rollbackCount)
    }

    @Test fun `three crashing launches then a fourth rolls back to the previous bundle`() = runTest {
        val clock = FakeClock()
        val log = FakeCrashLog()
        val guard = CrashLoopGuard(log, clock)
        val store = FakeBundleStore(hasPrevious = true)
        // Server crashes on every launch (a bad bundle that always fails to start).
        val server = FakeCapsuleServer(behavior = Behavior.CrashesAfter(successCount = 0))
        val rt = RecordingRuntime(server, guard, store)

        // Launches 1–3 each crash; no rollback yet (loop not confirmed until the next boot).
        repeat(3) {
            try { rt.start() } catch (_: RuntimeException) {}
            clock.advance(1_000)
        }
        assertEquals(0, store.rollbackCount)

        // Launch 4 sees three unconfirmed launches within the window → rolls back before booting.
        try { rt.start() } catch (_: RuntimeException) {}
        assertEquals(1, store.rollbackCount)
        assertEquals(1, rt.rollbackCount)
    }
}
