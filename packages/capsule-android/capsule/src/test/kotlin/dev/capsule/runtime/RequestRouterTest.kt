// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.InputStream

/**
 * Pure-JVM tests for [RequestRouter] — what every request to the embedded server gets back.
 * The socket half ([CivetwebServer]) is covered by the instrumented CivetwebServerTest.
 */
class RequestRouterTest {

    /** Map-backed StaticAssets that also records every path it was asked for. */
    private class MapStaticAssets(private val files: Map<String, String>) : StaticAssets {
        val requested = mutableListOf<String>()
        override fun open(path: String): InputStream? {
            requested += path
            return files[path]?.byteInputStream()
        }
    }

    private fun get(path: String) = HttpRequest("GET", path, emptyMap(), null)

    private val HttpResponse.text: String get() = body.use { it.readBytes().toString(Charsets.UTF_8) }

    // ── Static assets ───────────────────────────────────────────────────────────

    @Test fun `root serves index html`() {
        val router = RequestRouter(MapStaticAssets(mapOf("index.html" to "<html>home</html>")))

        val response = router.route(get("/"))

        assertEquals(200, response.status)
        assertEquals("text/html; charset=utf-8", response.mimeType)
        assertEquals("<html>home</html>", response.text)
    }

    @Test fun `nested assets are served with their content type, streamed`() {
        val router = RequestRouter(MapStaticAssets(mapOf("assets/main.js" to "console.log(1)")))

        val response = router.route(get("/assets/main.js"))

        assertEquals(200, response.status)
        assertEquals("text/javascript; charset=utf-8", response.mimeType)
        assertEquals(-1L, response.contentLength) // length unknown → transport sends it chunked
        assertEquals("console.log(1)", response.text)
    }

    @Test fun `missing asset is a 404 with the router's signature body`() {
        val response = RequestRouter(MapStaticAssets(emptyMap())).route(get("/no-such-asset.js"))

        assertEquals(404, response.status)
        assertEquals("Not found: no-such-asset.js", response.text)
    }

    @Test fun `parent-directory segments never reach the asset source`() {
        val assets = MapStaticAssets(mapOf("../server/routes.js" to "secret"))

        val response = RequestRouter(assets).route(get("/../server/routes.js"))

        assertEquals(404, response.status)
        assertTrue(assets.requested.isEmpty())
    }

    @Test fun `api paths are static assets when no api handler is installed`() {
        val response = RequestRouter(MapStaticAssets(emptyMap())).route(get("/api/ping"))

        assertEquals(404, response.status)
        assertEquals("Not found: api/ping", response.text)
    }

    // ── /api routes ─────────────────────────────────────────────────────────────

    @Test fun `api requests reach the handler with method, path, body and headers`() {
        var seen: List<Any?> = emptyList()
        val router = RequestRouter(MapStaticAssets(emptyMap())) { method, path, body, headers ->
            seen = listOf(method, path, body, headers)
            HttpRouteResponse(status = 201, body = "{\"ok\":true}", mimeType = "application/json")
        }

        val response = router.route(
            HttpRequest("POST", "/api/todos", mapOf("content-type" to "application/json"), "{\"t\":\"ü\"}".toByteArray()),
        )

        assertEquals(listOf("POST", "/api/todos", "{\"t\":\"ü\"}", mapOf("content-type" to "application/json")), seen)
        assertEquals(201, response.status)
        assertEquals("application/json", response.mimeType)
        assertEquals("{\"ok\":true}".length.toLong(), response.contentLength)
        assertEquals("{\"ok\":true}", response.text)
    }

    @Test fun `an empty body reaches the handler as null`() {
        var seenBody: String? = "unset"
        val router = RequestRouter(MapStaticAssets(emptyMap())) { _, _, body, _ ->
            seenBody = body
            HttpRouteResponse(status = 200, body = "", mimeType = "text/plain")
        }

        router.route(HttpRequest("POST", "/api/x", emptyMap(), ByteArray(0)))

        assertNull(seenBody)
    }

    @Test fun `unhandled api route is a 404`() {
        val router = RequestRouter(MapStaticAssets(emptyMap())) { _, _, _, _ -> null }

        val response = router.route(get("/api/missing"))

        assertEquals(404, response.status)
        assertEquals("No handler for /api/missing", response.text)
    }

    @Test fun `a failing api handler is a 500, not a crash`() {
        val router = RequestRouter(MapStaticAssets(emptyMap())) { _, _, _, _ -> error("boom") }

        val response = router.route(get("/api/explode"))

        assertEquals(500, response.status)
        assertTrue(response.text.contains("boom"))
    }

    // ── Content types ───────────────────────────────────────────────────────────

    @Test fun `content types come from the extension, case-insensitively`() {
        assertEquals("application/wasm", MimeTypes.forPath("lib/engine.WASM"))
        assertEquals("image/svg+xml", MimeTypes.forPath("icons/logo.svg"))
        assertEquals("application/octet-stream", MimeTypes.forPath("LICENSE"))
        assertEquals("application/octet-stream", MimeTypes.forPath("dir.v2/file"))
    }
}
