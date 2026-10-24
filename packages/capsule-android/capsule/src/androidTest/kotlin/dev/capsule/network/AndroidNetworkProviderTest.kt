// Docs: docs/reference/core-api.md
package dev.capsule.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests for the real [AndroidNetworkProvider] — `current()` reads
 * `ConnectivityManager`, which pure JVM can't exercise, so this runs on a
 * device/emulator. The emulator is normally online over Wi-Fi/cellular, so we
 * assert the invariant rather than a specific transport.
 */
@RunWith(AndroidJUnit4::class)
class AndroidNetworkProviderTest {

    private val provider =
        AndroidNetworkProvider(InstrumentationRegistry.getInstrumentation().targetContext)

    @Test
    fun currentReturnsASaneStatus() {
        val status = provider.current()
        assertNotNull(status)
        // The core invariant: NONE transport ⇔ not connected.
        assertEquals(status.connectionType == ConnectionType.NONE, !status.connected)
    }

    @Test
    fun startThenStopDeliversAtLeastTheInitialStatus() {
        val seen = mutableListOf<NetworkStatus>()
        provider.start { seen += it }
        // registerDefaultNetworkCallback fires onAvailable for the active network
        // shortly after registration; give it a beat on the emulator.
        Thread.sleep(2_000)
        provider.stop()
        assertTrue("expected at least one connectivity callback", seen.isNotEmpty())
    }
}
