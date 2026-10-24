// Docs: docs/reference/core-api.md
package dev.capsule.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build

/**
 * Android [NetworkProvider] backed by `ConnectivityManager`. `current()` reads
 * the active network's capabilities; the change feed registers a callback and,
 * on any transition, recomputes the active status and pushes it — the
 * [NetworkStatusController] de-dups, so redundant callbacks are harmless.
 *
 * Device-only: exercised by the instrumented test. The handler/controller layers
 * are unit-tested against [NetworkProvider] with a fake instead.
 */
class AndroidNetworkProvider(context: Context) : NetworkProvider {

    private val cm =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private var callback: ConnectivityManager.NetworkCallback? = null

    override fun current(): NetworkStatus {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = cm.activeNetwork ?: return OFFLINE
            val caps = cm.getNetworkCapabilities(network) ?: return OFFLINE
            return caps.toStatus()
        }
        @Suppress("DEPRECATION")
        val info = cm.activeNetworkInfo
        @Suppress("DEPRECATION")
        if (info == null || !info.isConnected) return OFFLINE
        @Suppress("DEPRECATION")
        val type = when (info.type) {
            ConnectivityManager.TYPE_WIFI -> ConnectionType.WIFI
            ConnectivityManager.TYPE_MOBILE -> ConnectionType.CELLULAR
            ConnectivityManager.TYPE_ETHERNET -> ConnectionType.ETHERNET
            else -> ConnectionType.UNKNOWN
        }
        return NetworkStatus(true, type)
    }

    override fun start(onChange: (NetworkStatus) -> Unit) {
        if (callback != null) return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = onChange(current())
            override fun onLost(network: Network) = onChange(current())
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) =
                onChange(current())
        }
        callback = cb
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            cm.registerDefaultNetworkCallback(cb)
        } else {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            cm.registerNetworkCallback(request, cb)
        }
    }

    override fun stop() {
        callback?.let { cm.unregisterNetworkCallback(it) }
        callback = null
    }

    private fun NetworkCapabilities.toStatus(): NetworkStatus {
        if (!hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return OFFLINE
        val type = when {
            hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> ConnectionType.WIFI
            hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> ConnectionType.CELLULAR
            hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> ConnectionType.ETHERNET
            else -> ConnectionType.UNKNOWN
        }
        return NetworkStatus(true, type)
    }

    private companion object {
        val OFFLINE = NetworkStatus(false, ConnectionType.NONE)
    }
}
