// Docs: docs/reference/core-api.md
package dev.capsule.app

import android.content.Intent

/**
 * The one Android-touching part of the deep-link path: turns an [Intent] into a
 * URL string, isolated here so [AppLifecycleController] stays pure-JVM.
 *
 * A deep link reaches the app as an `ACTION_VIEW` intent whose data is the URL
 * (custom scheme `myapp://…` or an https App Link). The `LAUNCHER` intent that
 * starts the app normally has no data, so it yields null.
 */
object AndroidDeepLinkParser {
    fun urlFrom(intent: Intent?): String? {
        if (intent == null || intent.action != Intent.ACTION_VIEW) return null
        return intent.dataString?.takeIf { it.isNotBlank() }
    }
}
