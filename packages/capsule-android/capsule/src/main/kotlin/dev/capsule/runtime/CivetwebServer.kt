// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.util.concurrent.ConcurrentHashMap

/**
 * [CapsuleServer] on CivetWeb (`packages/native/civetweb`) — the same C server the iOS shell runs.
 *
 * - Binds `127.0.0.1:[port]` only: nothing off the device can reach it.
 * - **Readiness:** `mg_start2` returns only once the socket is bound and listening, so [start]
 *   meets the contract without a probe or retry loop (docs/project/incidents/2026-10-embedded-server-startup.md).
 * - CivetWeb never serves files itself (built with `NO_FILES`): every request goes through JNI
 *   (`capsule_server_jni.c`) to [RequestRouter], and its [HttpResponse] is streamed back.
 */
class CivetwebServer(
    staticAssets: StaticAssets,
    override val port: Int,
    apiHandler: (suspend (String, String, String?, Map<String, String>) -> HttpRouteResponse?)? = null,
    /** CivetWeb holds one worker per open connection; the WebView keeps up to 6 alive per host. */
    private val workerThreads: Int = 16,
) : CapsuleServer {

    private val router = RequestRouter(staticAssets, apiHandler)

    /** Native `capsule_server*`, or 0 when stopped. */
    @Volatile private var handle = 0L

    override suspend fun start() = withContext(Dispatchers.IO) {
        if (handle != 0L) return@withContext
        // A server stopped on this port moments ago (e.g. Activity recreation) may still be
        // shutting down; it owns the port until it has.
        stopping.remove(port)?.let { runInterruptible { it.join() } }
        val error = arrayOfNulls<String>(1)
        val started = nativeStart(port, workerThreads, error)
        if (started == 0L) throw startupFailure(error[0])
        handle = started
    }

    /**
     * Returns at once; the port is released on a background thread. `mg_stop` joins the worker
     * threads, and a worker can be inside an `/api` route that waits on the main thread — joining
     * on the caller's (main) thread would deadlock. [start] waits for this shutdown to finish.
     */
    override fun stop() {
        val current = handle
        if (current == 0L) return
        handle = 0L
        val shutdown = Thread({ nativeStop(current) }, "capsule-http-stop")
        stopping[port] = shutdown
        shutdown.start()
    }

    /** Called by the JNI glue on a CivetWeb worker thread, once per request. Must not throw. */
    @Suppress("unused") // invoked from capsule_server_jni.c
    private fun onRequest(method: String, path: ByteArray, headers: ByteArray, body: ByteArray?): HttpResponse =
        try {
            router.route(HttpRequest(method, path.toString(Charsets.UTF_8), parseHeaders(headers), body))
        } catch (e: Exception) {
            HttpResponse.text(500, "Internal server error: ${e.message}")
        }

    private fun startupFailure(detail: String?): ServerStartupException {
        val cause = IOException(detail?.takeIf { it.isNotBlank() } ?: "CivetWeb did not report a reason")
        return if (isPortFree()) {
            ServerStartupException("Embedded server failed to start on port $port", cause)
        } else {
            ServerStartupException("Port $port is already in use by another process", cause)
        }
    }

    private fun isPortFree(): Boolean = try {
        ServerSocket().use { it.bind(InetSocketAddress(LOOPBACK_V4, port)) }
        true
    } catch (_: IOException) {
        false
    }

    private external fun nativeStart(port: Int, workerThreads: Int, errorOut: Array<String?>): Long
    private external fun nativeStop(handle: Long)

    private companion object {
        /** In-flight shutdowns by port — process-wide, since a new instance reuses the port. */
        val stopping = ConcurrentHashMap<Int, Thread>()

        /**
         * The address CivetWeb listens on. Not `InetAddress.getLoopbackAddress()`: on Android that
         * is `::1`, a different socket, so it would call a taken port free.
         */
        val LOOPBACK_V4: InetAddress = InetAddress.getByAddress(byteArrayOf(127, 0, 0, 1))

        init {
            System.loadLibrary("capsule_server")
        }
    }
}

/**
 * Decodes the JNI header block — `name\0value\0name\0value\0…` — into a map with lower-cased
 * names. Repeated headers are joined with ", " (RFC 9110 §5.3). Top-level (not in the companion)
 * so JVM unit tests can call it without loading the native library.
 */
internal fun parseHeaders(block: ByteArray): Map<String, String> {
    val parts = block.toString(Charsets.UTF_8).split('\u0000')
    val headers = linkedMapOf<String, String>()
    var i = 0
    while (i + 1 < parts.size) {
        val name = parts[i].lowercase()
        val value = parts[i + 1]
        headers[name] = headers[name]?.let { "$it, $value" } ?: value
        i += 2
    }
    return headers
}
