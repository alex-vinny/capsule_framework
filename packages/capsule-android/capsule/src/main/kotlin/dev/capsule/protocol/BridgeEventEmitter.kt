// Docs: docs/concepts/architecture.md
package dev.capsule.protocol

import kotlinx.serialization.json.JsonElement

/**
 * Shared seam through which event-driven controllers push native → JS
 * notifications (no response). Used by every capability whose value source is a
 * *feed* rather than a request/response call — app lifecycle, network status,
 * and any future push-style API.
 *
 * In production this is `CapsuleBridge::sendNotification`; in unit tests it is a
 * recording fake, which keeps each controller's emission logic fully pure-JVM
 * testable with no WebView required.
 *
 * The iOS shell (Phase 4) drives the same controllers through this same contract
 * from its scene delegate / NWPathMonitor — the controller logic is shared.
 */
fun interface BridgeEventEmitter {
    fun emit(method: String, params: JsonElement)
}
