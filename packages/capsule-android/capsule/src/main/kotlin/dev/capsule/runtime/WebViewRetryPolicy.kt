// Docs: docs/concepts/architecture.md
package dev.capsule.runtime

import android.webkit.WebViewClient

/**
 * Decision table for retrying a failed MAIN-frame WebView load (SR-4/D4 of
 * `docs/project/incidents/2026-10-embedded-server-startup.md`) — pure and unit-tested, per the repo's
 * pure-logic discipline. The WebViewClient wiring applies it; nothing Android-specific
 * lives here beyond the well-known error-code constants (compile-time `static final int`s,
 * safe on the JVM).
 *
 * Rationale: the readiness probe (CivetwebServer) removes the startup race at its source;
 * this policy is defense in depth for residual transient connect failures (and device
 * slowness). It is deliberately capped and narrow so it can never mask a real content bug
 * for long: three attempts, ~1.05s total backoff, connection-class errors only.
 */
object WebViewRetryPolicy {

    /** Retries per failing URL (0-based attempt counter; attempt 3+ never retries). */
    const val MAX_RETRIES = 3

    /**
     * Connection-class errors worth retrying. `ERROR_UNKNOWN` is included deliberately:
     * it is the WebView's catch-all and some connection-refused mappings land there; the
     * attempt cap bounds any masking. Deliberately excluded: host lookup (no DNS for
     * 127.0.0.1 — retrying would mask real URL bugs), auth, SSL, unsupported scheme,
     * redirect loops, bad URLs.
     */
    val RETRYABLE_ERROR_CODES: Set<Int> = setOf(
        WebViewClient.ERROR_CONNECT,     // -6: failed to connect (our race window)
        WebViewClient.ERROR_IO,          // -7: transient I/O
        WebViewClient.ERROR_TIMEOUT,     // -8
        WebViewClient.ERROR_UNKNOWN,     // -1: catch-all (incl. some refused mappings)
    )

    /** True when a main-frame load that failed with [errorCode] should be retried. */
    fun shouldRetry(errorCode: Int, retriesDone: Int): Boolean =
        retriesDone < MAX_RETRIES && errorCode in RETRYABLE_ERROR_CODES

    /** Backoff before retry number [retriesDone]+1: 150ms, 300ms, 600ms. */
    fun delayMs(retriesDone: Int): Long {
        val step = retriesDone.coerceIn(0, MAX_RETRIES - 1)
        return 150L shl step
    }
}
