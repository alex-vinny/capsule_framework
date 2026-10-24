// Docs: docs/concepts/architecture.md
package dev.capsule.runtime

import android.webkit.WebView

/** AppNavigator that drives a real WebView. */
class WebViewNavigator(private val webView: WebView) : AppNavigator {
    override fun navigateTo(url: String) {
        webView.loadUrl(url)
    }
}
