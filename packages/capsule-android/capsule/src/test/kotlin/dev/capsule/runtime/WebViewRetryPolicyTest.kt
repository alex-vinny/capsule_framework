package dev.capsule.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Decision-table test for [WebViewRetryPolicy] (SR-4/D4 — pure, JVM). */
class WebViewRetryPolicyTest {

    @Test fun `connection-class errors are retryable`() {
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -6, retriesDone = 0))  // ERROR_CONNECT
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -7, retriesDone = 0))  // ERROR_IO
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -8, retriesDone = 0))  // ERROR_TIMEOUT
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -1, retriesDone = 0))  // ERROR_UNKNOWN
    }

    @Test fun `non-connection errors are never retried`() {
        assertFalse(WebViewRetryPolicy.shouldRetry(errorCode = -2, retriesDone = 0))  // HOST_LOOKUP
        assertFalse(WebViewRetryPolicy.shouldRetry(errorCode = -11, retriesDone = 0)) // SSL
        assertFalse(WebViewRetryPolicy.shouldRetry(errorCode = -12, retriesDone = 0)) // BAD_URL
        assertFalse(WebViewRetryPolicy.shouldRetry(errorCode = -10, retriesDone = 0)) // UNSUPPORTED_SCHEME
    }

    @Test fun `budget caps at three retries`() {
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -6, retriesDone = 0))
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -6, retriesDone = 1))
        assertTrue(WebViewRetryPolicy.shouldRetry(errorCode = -6, retriesDone = 2))
        assertFalse(WebViewRetryPolicy.shouldRetry(errorCode = -6, retriesDone = 3))
    }

    @Test fun `backoff is 150 300 600`() {
        assertEquals(150L, WebViewRetryPolicy.delayMs(0))
        assertEquals(300L, WebViewRetryPolicy.delayMs(1))
        assertEquals(600L, WebViewRetryPolicy.delayMs(2))
        // Out-of-range attempts clamp instead of exploding.
        assertEquals(600L, WebViewRetryPolicy.delayMs(9))
    }

    @Test fun `total backoff stays small (masking bound)`() {
        val total = (0 until WebViewRetryPolicy.MAX_RETRIES).sumOf { WebViewRetryPolicy.delayMs(it) }
        assertTrue("total backoff $total must stay under 1.5s", total <= 1_500L)
    }
}
