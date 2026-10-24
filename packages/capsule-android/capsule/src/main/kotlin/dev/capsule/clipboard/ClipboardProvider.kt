// Docs: docs/reference/core-api.md
package dev.capsule.clipboard

interface ClipboardProvider {
    fun read(): String?
    fun write(text: String)
}
