// Docs: docs/reference/core-api.md
package dev.capsule.network

import dev.capsule.protocol.BridgeEventEmitter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Platform-neutral network-status logic, parallel to
 * [dev.capsule.app.AppLifecycleController]: it owns no Android types, so it is
 * fully unit-testable on the JVM with a fake [BridgeEventEmitter]. The Android
 * shell drives it from a `ConnectivityManager` callback; the iOS shell (Phase 4)
 * drives the *same* class from `NWPathMonitor`.
 *
 * Its one job is **de-dup + emit**: a provider callback may fire repeatedly with
 * an unchanged status (capability churn, multiple networks), so only genuine
 * transitions are pushed to JS as `network.statusChange`.
 *
 * Method names mirror `@capsule/core`'s `NetworkMethods`.
 */
class NetworkStatusController(private val emitter: BridgeEventEmitter) {

    private var last: NetworkStatus? = null

    /** Feed a fresh status; emits `network.statusChange` only if it differs from the last. */
    fun update(status: NetworkStatus) {
        if (status == last) return
        last = status
        emitter.emit(STATUS_CHANGE, Json.encodeToJsonElement(status))
    }

    companion object {
        const val GET_STATUS = "network.getStatus"
        const val STATUS_CHANGE = "network.statusChange"
    }
}
