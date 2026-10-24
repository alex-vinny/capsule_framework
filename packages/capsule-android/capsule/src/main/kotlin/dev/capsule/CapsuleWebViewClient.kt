// Docs: docs/concepts/architecture.md
package dev.capsule

import android.graphics.Bitmap
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import dev.capsule.runtime.WebViewRetryPolicy

class CapsuleWebViewClient(
    internal val isDevMode: Boolean = false,
    // Invoked when a page finishes loading — used to confirm a healthy launch for crash-loop
    // protection (CapsuleRuntime.notifyAppReady).
    private val onPageReady: (() -> Unit)? = null,
) : WebViewClient() {

    // Retry bookkeeping (SR-4/D4, docs/project/incidents/2026-10-embedded-server-startup.md): keyed by the
    // failing URL so a genuinely new navigation resets the budget, while retries of the same
    // URL consume it. `retryScheduled` suppresses onPageReady for a failed load whose retry is
    // still pending — otherwise the splash would reveal the error page mid-retry (and the
    // crash-loop guard would confirm an unhealthy launch).
    private var retryUrl: String? = null
    private var retriesDone = 0
    private var retryScheduled = false

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        // Let the WebView handle all navigation — single-page app
        return false
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        // A load is actually progressing — any pending retry has been superseded.
        retryScheduled = false
    }

    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        if (retryScheduled) return // a retry is pending; wait for its outcome
        retryUrl = null
        onPageReady?.invoke()
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        super.onReceivedError(view, request, error)
        if (!request.isForMainFrame) return
        val failingUrl = request.url?.toString() ?: return
        if (failingUrl == retryUrl) {
            // This error IS the outcome of a scheduled retry — the budget already counted it.
        } else {
            retryUrl = failingUrl
            retriesDone = 0
        }
        if (!WebViewRetryPolicy.shouldRetry(error.errorCode, retriesDone)) {
            retryScheduled = false
            return
        }
        val delay = WebViewRetryPolicy.delayMs(retriesDone)
        retriesDone++
        retryScheduled = true
        view.postDelayed({ view.loadUrl(failingUrl) }, delay)
    }
}
