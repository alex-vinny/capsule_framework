// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.io.InputStream

/** A request as the embedded server received it, independent of the HTTP library. */
class HttpRequest(
    val method: String,
    /** Decoded path without the query string, e.g. `/api/todos`. */
    val path: String,
    /** Header names are lower-cased (HTTP header names are case-insensitive). */
    val headers: Map<String, String>,
    val body: ByteArray?,
)

/**
 * What the server writes back. The native transport reads these fields through JNI (hence
 * `@JvmField`, and the keep rules in `consumer-rules.pro`), streams [body] to the client and
 * closes it.
 */
class HttpResponse(
    @JvmField val status: Int,
    @JvmField val mimeType: String,
    @JvmField val body: InputStream,
    /** Byte length of [body], or -1 when unknown (the transport then sends it chunked). */
    @JvmField val contentLength: Long,
) {
    companion object {
        fun bytes(status: Int, mimeType: String, bytes: ByteArray) =
            HttpResponse(status, mimeType, ByteArrayInputStream(bytes), bytes.size.toLong())

        fun text(status: Int, text: String) = bytes(status, MimeTypes.TEXT, text.toByteArray(Charsets.UTF_8))
    }
}

/**
 * Decides what every request to the embedded server gets back: `/api/` paths go to the QuickJS
 * route handler, everything else is a static asset from [staticAssets] (`/` → `index.html`).
 *
 * Free of any HTTP library and of Android, so it is unit-tested on the plain JVM; the transport
 * ([CivetwebServer]) only moves bytes between the socket and [route].
 */
class RequestRouter(
    private val staticAssets: StaticAssets,
    private val apiHandler: (suspend (String, String, String?, Map<String, String>) -> HttpRouteResponse?)? = null,
) {

    /** Blocking: the transport calls this on its own worker thread. Never throws. */
    fun route(request: HttpRequest): HttpResponse =
        if (request.path.startsWith(API_PREFIX) && apiHandler != null) routeApi(apiHandler, request)
        else routeAsset(request.path)

    // runBlocking hands the suspend handler to QuickJS's single-thread dispatcher and waits on
    // this worker thread. No deadlock: QuickJS never runs on a server worker thread.
    private fun routeApi(
        handler: suspend (String, String, String?, Map<String, String>) -> HttpRouteResponse?,
        request: HttpRequest,
    ): HttpResponse {
        val body = request.body?.takeIf { it.isNotEmpty() }?.toString(Charsets.UTF_8)
        val response = try {
            runBlocking { handler(request.method, request.path, body, request.headers) }
        } catch (e: Exception) {
            return HttpResponse.text(500, "Route ${request.path} failed: ${e.message}")
        }
        if (response == null) return HttpResponse.text(404, "No handler for ${request.path}")
        return HttpResponse.bytes(response.status, response.mimeType, response.body.toByteArray(Charsets.UTF_8))
    }

    private fun routeAsset(path: String): HttpResponse {
        val assetPath = path.trimStart('/').ifEmpty { INDEX }
        // CivetWeb already removes `..` segments; this keeps the router safe on its own.
        if (assetPath.split('/').any { it == ".." }) return notFound(assetPath)
        val stream = staticAssets.open(assetPath) ?: return notFound(assetPath)
        return HttpResponse(200, MimeTypes.forPath(assetPath), stream, -1)
    }

    private fun notFound(assetPath: String) = HttpResponse.text(404, "Not found: $assetPath")

    private companion object {
        const val API_PREFIX = "/api/"
        const val INDEX = "index.html"
    }
}

/** Content types for static assets, by file extension. */
object MimeTypes {
    const val TEXT = "text/plain; charset=utf-8"
    private const val DEFAULT = "application/octet-stream"

    private val byExtension = mapOf(
        "html" to "text/html; charset=utf-8",
        "htm" to "text/html; charset=utf-8",
        "js" to "text/javascript; charset=utf-8",
        "mjs" to "text/javascript; charset=utf-8",
        "css" to "text/css; charset=utf-8",
        "json" to "application/json; charset=utf-8",
        "map" to "application/json; charset=utf-8",
        "webmanifest" to "application/manifest+json",
        "txt" to TEXT,
        "xml" to "application/xml",
        "svg" to "image/svg+xml",
        "png" to "image/png",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "avif" to "image/avif",
        "ico" to "image/x-icon",
        "woff" to "font/woff",
        "woff2" to "font/woff2",
        "ttf" to "font/ttf",
        "otf" to "font/otf",
        "wasm" to "application/wasm",
        "mp3" to "audio/mpeg",
        "wav" to "audio/wav",
        "ogg" to "audio/ogg",
        "mp4" to "video/mp4",
        "webm" to "video/webm",
        "pdf" to "application/pdf",
    )

    fun forPath(path: String): String =
        byExtension[path.substringAfterLast('/').substringAfterLast('.', "").lowercase()] ?: DEFAULT
}
