// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PortUtilsTest {

    @Test fun `port is within ephemeral range`() {
        val port = portForAppId("com.example.myapp")
        assertTrue("port $port must be >= 49152", port >= 49_152)
        assertTrue("port $port must be <= 65535", port <= 65_535)
    }

    @Test fun `same appId always returns same port`() {
        val appId = "dev.capsule.testapp"
        assertEquals(portForAppId(appId), portForAppId(appId))
    }

    @Test fun `different appIds return different ports`() {
        val a = portForAppId("com.example.alpha")
        val b = portForAppId("com.example.beta")
        assertTrue("expected different ports for different appIds, got $a and $b", a != b)
    }

    @Test fun `empty string does not crash`() {
        val port = portForAppId("")
        assertTrue(port in 49_152..65_535)
    }

    @Test fun `known appId returns stable port`() {
        // Regression: if the algorithm changes, this test catches it.
        val port = portForAppId("dev.capsule.app")
        val expected = "dev.capsule.app".hashCode().and(0x7FFF_FFFF) % (65_535 - 49_152 + 1) + 49_152
        assertEquals(expected, port)
    }
}
