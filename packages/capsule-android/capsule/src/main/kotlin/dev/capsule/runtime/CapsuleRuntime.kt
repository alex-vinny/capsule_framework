// Docs: docs/concepts/architecture.md
package dev.capsule.runtime

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

/**
 * Coordinates the embedded server, JS engine, splash screen, and WebView navigation.
 *
 * Lifecycle:
 *   start() → [crash-loop check] → splash.show() → server.start() → navigator.navigateTo()
 *             → [await app ready] → splash.hide()
 *   stop()  → server.stop()
 *
 * The splash is held until the web layer reports ready ([notifyAppReady], wired to the WebView's
 * page-finished callback) rather than the instant navigation is *kicked off* — otherwise the splash
 * would clear while the WebView is still blank, exposing an empty page mid-load. A [readyTimeoutMs]
 * cap guarantees the splash can never strand on screen if that callback is missed.
 *
 * If the server does not bind within [timeoutMs], [onStartTimeout] is called and a
 * [TimeoutCancellationException] is propagated to the caller (Activity handles retry UI).
 *
 * **Crash-loop protection (Phase 2 Step 7).** When a [crashGuard] and [bundleStore] are supplied,
 * each [start] records a launch attempt. If prior launches crash-looped (see [CrashLoopGuard]) and
 * a previous known-good bundle exists, the runtime rolls back to it *before* booting and invokes
 * [onRollback]. The web layer must call [notifyAppReady] once it loads successfully so the launch
 * is confirmed healthy and the crash counter resets.
 */
open class CapsuleRuntime(
    private val server: CapsuleServer,
    private val jsEngine: QuickJSEngine,
    private val splash: SplashController,
    private val navigator: AppNavigator,
    private val quickJsBridge: QuickJSBridge? = null,
    private val bundleStore: BundleStore? = null,
    private val crashGuard: CrashLoopGuard? = null,
    val timeoutMs: Long = 3_000,
    private val readyTimeoutMs: Long = 10_000,
) {
    // Completed by notifyAppReady() (the WebView's page-finished callback). Lets start() keep the
    // splash up until the page has actually rendered, not merely been told to load.
    private val appReady = CompletableDeferred<Unit>()

    suspend fun start() {
        splash.show()

        // Crash-loop protection: if recent launches died before reporting ready, revert to the
        // last known-good bundle before attempting another (likely-crashing) boot.
        if (crashGuard?.isCrashLooping() == true && bundleStore?.hasPrevious() == true) {
            bundleStore.rollback()
            crashGuard.clear()
            onRollback()
        }

        // Mark this launch as unconfirmed; notifyAppReady() clears it once the app loads.
        crashGuard?.recordLaunchAttempt()

        try {
            withTimeout(timeoutMs) {
                server.start()
            }
        } catch (e: TimeoutCancellationException) {
            onStartTimeout()
            throw e
        }
        quickJsBridge?.load()
        navigator.navigateTo("http://127.0.0.1:${server.port}/")

        // Hold the splash until the page reports ready, with a hard cap so a missed page-finished
        // callback can't leave it stranded — better a possibly-early reveal than a stuck splash.
        try {
            withTimeout(readyTimeoutMs) { appReady.await() }
        } catch (_: TimeoutCancellationException) {
            // Fall through and reveal anyway.
        }
        splash.hide()
    }

    /**
     * Signal that the web layer loaded successfully: clears the crash-loop counter so the launch is
     * treated as healthy, and releases the splash. Call from the WebView's page-finished callback.
     */
    fun notifyAppReady() {
        crashGuard?.clear()
        appReady.complete(Unit)
    }

    fun stop() {
        server.stop()
        jsEngine.close()
    }

    /** Called when server.start() exceeds [timeoutMs]. Override to show an error screen. */
    protected open fun onStartTimeout() {}

    /** Called after a crash-loop rollback restores the previous bundle. Override to react (e.g. log/telemetry). */
    protected open fun onRollback() {}
}
