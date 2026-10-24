package dev.capsule

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapsuleWebViewClientTest {

    @Test
    fun `isDevMode false by default`() {
        val client = CapsuleWebViewClient()
        assertFalse(client.isDevMode)
    }

    @Test
    fun `isDevMode true when set`() {
        val client = CapsuleWebViewClient(isDevMode = true)
        assertTrue(client.isDevMode)
    }
}
