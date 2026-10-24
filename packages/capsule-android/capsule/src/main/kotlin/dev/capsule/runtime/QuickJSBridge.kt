// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

/** Response returned by an HTTP route handler running in QuickJS. */
data class HttpRouteResponse(
    val status: Int,
    val body: String,
    val mimeType: String,
)

/** Loads a JS routing bundle and dispatches JSON-RPC and HTTP requests through it. */
interface QuickJSBridge {
    /**
     * Evaluates the JS routing bundle into the engine.
     * Must be called before [handleRequest] / [handleHttpRequest] will return non-null results.
     */
    suspend fun load()

    /**
     * Tries to handle a JSON-RPC [requestJson] by calling the JS global dispatch() function.
     *
     * Returns a JSON-RPC response string if a JS handler was registered for the method,
     * or null to fall through to native Kotlin handlers.
     */
    suspend fun handleRequest(requestJson: String): String?

    /**
     * Tries to handle an HTTP request by calling the JS global handleHttpRequest() function.
     *
     * Returns an [HttpRouteResponse] if a handler was registered for the given path + method,
     * or null if no handler matches (caller should respond with 404).
     */
    suspend fun handleHttpRequest(
        method: String,
        path: String,
        body: String?,
        headers: Map<String, String>,
    ): HttpRouteResponse?
}
