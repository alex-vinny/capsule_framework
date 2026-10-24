// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URL

/**
 * Real-socket tests for [CivetwebServer] — the native server and its JNI glue, on a device.
 * Routing rules themselves are covered on the JVM by RequestRouterTest.
 *
 * The readiness contract (SR-2, `docs/project/incidents/2026-10-embedded-server-startup.md`) is asserted with
 * **no sleep and no retry**: a request immediately after `start()` returns must succeed.
 */
@RunWith(AndroidJUnit4::class)
class CivetwebServerTest {

    private class MapStaticAssets(private val files: Map<String, ByteArray>) : StaticAssets {
        override fun open(path: String): InputStream? = files[path]?.inputStream()
    }

    private val servers = mutableListOf<CivetwebServer>()

    /** The server's listen address — Android's getLoopbackAddress() is ::1, a different socket. */
    private val LOOPBACK_V4: InetAddress = InetAddress.getByAddress(byteArrayOf(127, 0, 0, 1))

    @After fun stopAll() = servers.forEach { it.stop() }

    private fun freePort(): Int = ServerSocket(0, 1, LOOPBACK_V4).use { it.localPort }

    private fun server(
        port: Int = freePort(),
        files: Map<String, String> = mapOf("index.html" to "<html>cold start</html>"),
        apiHandler: (suspend (String, String, String?, Map<String, String>) -> HttpRouteResponse?)? = null,
    ) = CivetwebServer(MapStaticAssets(files.mapValues { it.value.toByteArray() }), port, apiHandler)
        .also { servers += it }

    private fun open(port: Int, path: String, method: String = "GET") =
        (URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection).apply { requestMethod = method }

    private fun HttpURLConnection.bodyText(): String =
        (if (responseCode < 400) inputStream else errorStream).use { it.readBytes().toString(Charsets.UTF_8) }

    // ── The readiness contract ──────────────────────────────────────────────────

    @Test fun a_GET_immediately_after_start_returns_succeeds() = runBlocking {
        val s = server()
        s.start() // must not return until the socket accepts — the contract under test

        assertEquals("<html>cold start</html>", URL("http://127.0.0.1:${s.port}/").readText())
    }

    // ── Serving ─────────────────────────────────────────────────────────────────

    @Test fun serves_assets_with_content_type_and_404s_missing_ones() = runBlocking {
        val s = server(files = mapOf("assets/main.js" to "console.log(1)"))
        s.start()

        val js = open(s.port, "/assets/main.js")
        assertEquals(200, js.responseCode)
        assertEquals("text/javascript; charset=utf-8", js.contentType)
        assertEquals("console.log(1)", js.bodyText())

        val missing = open(s.port, "/no-such-asset.js")
        assertEquals(404, missing.responseCode)
        assertEquals("Not found: no-such-asset.js", missing.bodyText())
    }

    @Test fun a_large_asset_streams_intact() = runBlocking {
        val big = ByteArray(1_000_003) { (it % 251).toByte() } // > the 64 KiB copy chunk, odd size
        val s = CivetwebServer(MapStaticAssets(mapOf("blob.bin" to big)), freePort()).also { servers += it }
        s.start()

        val received = open(s.port, "/blob.bin").inputStream.use { it.readBytes() }

        assertArrayEquals(big, received)
    }

    @Test fun api_requests_carry_method_body_and_headers_through_JNI() = runBlocking {
        var seen: List<Any?> = emptyList()
        val s = server { method, path, body, headers ->
            seen = listOf(method, path, body, headers["x-capsule-test"])
            HttpRouteResponse(status = 201, body = "{\"echo\":\"$body\"}", mimeType = "application/json")
        }
        s.start()

        val conn = open(s.port, "/api/echo", method = "POST").apply {
            doOutput = true
            setRequestProperty("X-Capsule-Test", "yes")
            outputStream.use { it.write("héllo".toByteArray()) }
        }

        assertEquals(201, conn.responseCode)
        assertEquals("application/json", conn.contentType)
        assertEquals("{\"echo\":\"héllo\"}", conn.bodyText())
        assertEquals(listOf("POST", "/api/echo", "héllo", "yes"), seen)
    }

    @Test fun HEAD_returns_headers_without_a_body() = runBlocking {
        val s = server()
        s.start()

        val conn = open(s.port, "/", method = "HEAD")

        assertEquals(200, conn.responseCode)
        assertEquals(0, conn.inputStream.use { it.readBytes().size })
    }

    // ── Lifecycle & failures ────────────────────────────────────────────────────

    @Test fun port_already_in_use_surfaces_a_typed_exception_with_a_diagnosis() = runBlocking {
        ServerSocket(0, 1, LOOPBACK_V4).use { blocker ->
            try {
                server(port = blocker.localPort).start()
                fail("expected ServerStartupException")
            } catch (e: ServerStartupException) {
                assertTrue("message should name the cause, was: ${e.message}", e.message!!.contains("already in use"))
            }
        }
    }

    @Test fun a_new_server_can_start_on_the_port_right_after_stop() = runBlocking {
        val port = freePort()
        val first = server(port = port)
        first.start()
        first.stop() // returns at once; the port is released in the background

        val second = server(port = port, files = mapOf("index.html" to "second"))
        second.start() // must wait for the first shutdown, not fail with "in use"

        assertEquals("second", URL("http://127.0.0.1:$port/").readText())
    }
}
