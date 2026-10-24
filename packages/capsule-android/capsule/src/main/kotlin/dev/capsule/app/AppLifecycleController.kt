// Docs: docs/reference/core-api.md
package dev.capsule.app

import dev.capsule.protocol.BridgeEventEmitter
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Platform-neutral app-lifecycle + deep-link logic. The cross-platform seam:
 * the Android shell drives it from `ProcessLifecycleOwner` + Activity intents,
 * and the iOS shell (Phase 4) drives the *same* class from its scene delegate.
 * It owns no Android types, so it is fully unit-testable on the JVM with a fake
 * [BridgeEventEmitter].
 *
 * **State model** is the binary `isActive` both platforms agree on (foregrounded
 * & interactive). **Launch URL** is consume-once and held only in memory — there
 * is no persisted user data here, so the Phase-5 "persist outside the OTA bundle
 * dirs" constraint is satisfied trivially.
 *
 * Method names mirror `@capsule/core`'s `AppMethods`.
 */
class AppLifecycleController(private val emitter: BridgeEventEmitter) {

    /** Current foreground state. Defaults to active — the app is foregrounded at construction. */
    var isActive: Boolean = true
        private set

    private var launchUrl: String? = null

    /** Seed the deep link the app was cold-launched with (consumed once via [consumeLaunchUrl]). */
    fun setLaunchUrl(url: String?) {
        if (url != null) launchUrl = url
    }

    /** Returns the cold-launch deep link and clears it, so a second read yields null. */
    fun consumeLaunchUrl(): String? = launchUrl.also { launchUrl = null }

    /** App entered the foreground (ProcessLifecycle ON_START). Emits `app.stateChange` if it changed. */
    fun onForeground() = setActive(true)

    /** App left the foreground (ProcessLifecycle ON_STOP). Emits `app.stateChange` if it changed. */
    fun onBackground() = setActive(false)

    /** A deep link arrived while the app was running (warm). Emits `app.urlOpen`. */
    fun onNewUrl(url: String) {
        emitter.emit(URL_OPEN, buildJsonObject { put("url", url) })
    }

    private fun setActive(active: Boolean) {
        if (active == isActive) return
        isActive = active
        emitter.emit(STATE_CHANGE, buildJsonObject { put("isActive", active) })
    }

    companion object {
        const val CAPABILITY = "app"
        const val CAPABILITY_VERSION = 1

        const val GET_STATE = "app.getState"
        const val GET_LAUNCH_URL = "app.getLaunchUrl"
        const val STATE_CHANGE = "app.stateChange"
        const val URL_OPEN = "app.urlOpen"
    }
}
