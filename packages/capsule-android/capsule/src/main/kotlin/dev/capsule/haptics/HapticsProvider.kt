// Docs: docs/reference/core-api.md
package dev.capsule.haptics

interface HapticsProvider {
    fun vibrate(style: String)
}
