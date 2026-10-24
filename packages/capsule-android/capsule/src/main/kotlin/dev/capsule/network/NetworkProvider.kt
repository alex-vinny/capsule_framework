// Docs: docs/reference/core-api.md
package dev.capsule.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Platform-neutral network-reachability capability: a current-value reader plus
 * a change feed. The Android implementation wraps `ConnectivityManager`; the iOS
 * shell (Phase 4) implements this same interface with `NWPathMonitor`
 * (`path.status == .satisfied` → [NetworkStatus.connected]; `usesInterfaceType`
 * → [NetworkStatus.connectionType]), driving the *same*
 * [dev.capsule.network.NetworkStatusController]. Keeping the seam at the provider
 * — not at the Android plumbing underneath — is what makes the controller shared.
 *
 * No persistent state lives here, so the Phase-5 "persist outside the OTA bundle
 * dirs" constraint is satisfied trivially.
 */
interface NetworkProvider {
    /** Read the current reachability synchronously. */
    fun current(): NetworkStatus

    /** Begin observing connectivity; [onChange] fires on every transition. */
    fun start(onChange: (NetworkStatus) -> Unit)

    /** Stop observing. Safe to call when not started. */
    fun stop()

    companion object {
        /** Capability name + native version for OTA gating (see CapabilityRegistry). */
        const val CAPABILITY = "network"
        const val CAPABILITY_VERSION = 1
    }
}

/**
 * A snapshot of reachability. Serialized directly to the wire (shape mirrors
 * `@capsule/core`'s `NetworkStatus`), so the invariant
 * `connectionType == NONE ⇔ !connected` is the contract both sides rely on.
 */
@Serializable
data class NetworkStatus(
    val connected: Boolean,
    val connectionType: ConnectionType,
)

/**
 * Active transport. `@SerialName` pins each constant to its lowercase wire form
 * (`WIFI` → `"wifi"`), so kotlinx emits exactly what `@capsule/core`'s
 * `ConnectionType` union expects — the mapping lives at the definition, not in a
 * separate `when`.
 */
@Serializable
enum class ConnectionType {
    @SerialName("wifi") WIFI,
    @SerialName("cellular") CELLULAR,
    @SerialName("ethernet") ETHERNET,
    @SerialName("none") NONE,
    @SerialName("unknown") UNKNOWN,
}
