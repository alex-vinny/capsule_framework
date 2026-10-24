// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import java.io.IOException

/**
 * The embedded loopback HTTP server that fronts the QuickJS route runtime
 * (adr-001 — `docs/decisions/0001-embedded-runtime.md`).
 */
interface CapsuleServer {
    /** The deterministic port (derived from `appId`, adr-001 #7) the server serves on. */
    val port: Int

    /**
     * Starts the server.
     *
     * **Readiness contract (adr-001 #6, amended 2026-10-15 — see
     * `docs/project/incidents/2026-10-embedded-server-startup.md`):** this method must not return until the
     * server *accepts connections* on [port]. A `Socket` connect immediately after this returns
     * must succeed. Rationale: the first implementation (NanoHTTPD 2.3.1) returned before its
     * listener thread ran `bind()`, which let the WebView race the bind
     * (`ERR_CONNECTION_REFUSED` on fast devices) and made the runtime's bind timeout dead code.
     *
     * Failures (bind conflict, startup error) throw [ServerStartupException] — never a silent
     * thread-internal death.
     */
    suspend fun start()

    /**
     * Stops the server. Must not block the calling (main) thread on in-flight requests; the port
     * may be released asynchronously, but a later [start] on the same port must succeed.
     */
    fun stop()
}

/**
 * Thrown when the embedded server fails to start: the readiness deadline expired, or the
 * deterministic port could not be bound (typically held by another process).
 */
class ServerStartupException(message: String, cause: Throwable? = null) : Exception(message, cause)
