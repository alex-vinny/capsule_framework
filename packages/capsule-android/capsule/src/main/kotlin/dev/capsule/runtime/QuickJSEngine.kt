// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

interface QuickJSEngine : java.io.Closeable {
    /** Loads and evaluates a JS bundle string inside the engine. */
    suspend fun evaluate(bundle: String)

    /**
     * Calls a named global function and returns its JSON-serialised result.
     *
     * The C call helper wraps every JS return value in JSON.stringify(), so:
     *   - JS returns an object  → Kotlin receives clean JSON e.g. {"k":1}
     *   - JS returns a string   → Kotlin receives it double-encoded (avoid this)
     *   - JS returns null       → Kotlin receives the literal string "null"
     */
    suspend fun call(fn: String, args: String): String
}
