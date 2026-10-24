// Docs: docs/concepts/architecture.md
package dev.capsule

import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient

class CapsuleWebChromeClient : WebChromeClient() {
    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
        val level = when (message.messageLevel()) {
            ConsoleMessage.MessageLevel.ERROR -> "ERROR"
            ConsoleMessage.MessageLevel.WARNING -> "WARN"
            else -> "LOG"
        }
        android.util.Log.d("CapsuleWebView", "[$level] ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
        return true
    }
}
