// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

/**
 * Placeholder QuickJSEngine used in Steps 2–3 (static-asset serving only, no JS routes yet).
 * Replaced by the real JNI-backed engine in Step 4.
 */
internal class NoOpQuickJSEngine : QuickJSEngine {
    override suspend fun evaluate(bundle: String) = Unit
    override suspend fun call(fn: String, args: String) = "{}"
    override fun close() = Unit
}
