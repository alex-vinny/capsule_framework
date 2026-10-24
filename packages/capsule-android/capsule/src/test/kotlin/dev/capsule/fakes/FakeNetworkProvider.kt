package dev.capsule.fakes

import dev.capsule.network.ConnectionType
import dev.capsule.network.NetworkProvider
import dev.capsule.network.NetworkStatus

/**
 * Test double for [NetworkProvider]. [status] is the value `current()` returns
 * (settable); [push] simulates an OS connectivity change — it updates [status]
 * and notifies the listener registered via [start], so controller emission logic
 * can be driven in pure-JVM tests.
 */
class FakeNetworkProvider(
    var status: NetworkStatus = NetworkStatus(true, ConnectionType.WIFI),
) : NetworkProvider {

    private var listener: ((NetworkStatus) -> Unit)? = null

    var started = false
        private set

    override fun current(): NetworkStatus = status

    override fun start(onChange: (NetworkStatus) -> Unit) {
        listener = onChange
        started = true
    }

    override fun stop() {
        listener = null
        started = false
    }

    /** Simulate a connectivity change: updates [status] and notifies the listener. */
    fun push(next: NetworkStatus) {
        status = next
        listener?.invoke(next)
    }
}
