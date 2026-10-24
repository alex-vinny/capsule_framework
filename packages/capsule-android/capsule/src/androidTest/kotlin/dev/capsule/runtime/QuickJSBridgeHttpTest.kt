// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Integration tests for the HTTP routing half of QuickJSBridge.
 *
 * Uses a hand-crafted JS setup (no real bundle required) to test the Kotlin ↔ QuickJS
 * contract for handleHttpRequest(). Mirrors the pattern of QuickJSBridgeTest for
 * the JSON-RPC half.
 *
 * Follows the two JNI constraints from QuickJSBridgeTest:
 *  - State stored in globalThis (not closure vars)
 *  - Return plain JS objects, not pre-serialised strings
 */
@RunWith(AndroidJUnit4::class)
class QuickJSBridgeHttpTest {

    private lateinit var engine: QuickJSEngineImpl
    private lateinit var bridge: QuickJSBridge

    @Before
    fun setUp() {
        engine = QuickJSEngineImpl()
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        bridge = QuickJSBridgeImpl(engine, assets)
    }

    @After
    fun tearDown() {
        engine.close()
    }

    /** Minimal HTTP router script; additional route registrations appended via [extraRoutes]. */
    private fun httpRouterScript(vararg extraRoutes: String) = buildString {
        append(
            """
            globalThis.__http_routes = {};
            function addHttpRoute(path, method, handler) {
                if (!globalThis.__http_routes[path]) globalThis.__http_routes[path] = {};
                globalThis.__http_routes[path][method.toUpperCase()] = handler;
            }
            function handleHttpRequest(method, path, body, headers) {
                var routes = globalThis.__http_routes[path];
                if (!routes) return null;
                var verb = method.toUpperCase();
                var handler = routes[verb];
                if (!handler) return { status: 405, body: "Method Not Allowed", mimeType: "text/plain" };
                try {
                    var res = handler({ method: verb, path: path, body: body, headers: headers || {} });
                    return {
                        status: res.status || 200,
                        body: res.body != null ? String(res.body) : "",
                        mimeType: res.mimeType || "application/json"
                    };
                } catch(e) {
                    return { status: 500, body: String(e.message || e), mimeType: "text/plain" };
                }
            }
            """.trimIndent()
        )
        extraRoutes.forEach { append('\n'); append(it) }
    }

    @Test
    fun handleHttpRequest_unregisteredPath_returnsNull() = runTest {
        engine.evaluate(httpRouterScript())
        val result = bridge.handleHttpRequest("GET", "/api/unknown", null, emptyMap())
        assertNull(result)
    }

    @Test
    fun handleHttpRequest_registeredGet_returnsResponse() = runTest {
        engine.evaluate(
            httpRouterScript(
                """addHttpRoute("/api/ping", "GET", function() { return { status: 200, body: "pong", mimeType: "text/plain" }; });"""
            )
        )
        val result = bridge.handleHttpRequest("GET", "/api/ping", null, emptyMap())
        assertNotNull(result)
        assertEquals(200, result!!.status)
        assertEquals("pong", result.body)
        assertEquals("text/plain", result.mimeType)
    }

    @Test
    fun handleHttpRequest_wrongVerb_returns405() = runTest {
        engine.evaluate(
            httpRouterScript(
                """addHttpRoute("/api/ro", "GET", function() { return { body: "[]" }; });"""
            )
        )
        val result = bridge.handleHttpRequest("DELETE", "/api/ro", null, emptyMap())
        assertNotNull(result)
        assertEquals(405, result!!.status)
    }

    @Test
    fun handleHttpRequest_handlerReceivesBody() = runTest {
        engine.evaluate(
            httpRouterScript(
                """
                addHttpRoute("/api/echo", "POST", function(req) {
                    return { body: req.body };
                });
                """.trimIndent()
            )
        )
        val result = bridge.handleHttpRequest("POST", "/api/echo", """{"x":1}""", emptyMap())
        assertNotNull(result)
        assertEquals("""{"x":1}""", result!!.body)
    }

    @Test
    fun handleHttpRequest_handlerThrows_returns500() = runTest {
        engine.evaluate(
            httpRouterScript(
                """addHttpRoute("/api/boom", "GET", function() { throw new Error("kaboom"); });"""
            )
        )
        val result = bridge.handleHttpRequest("GET", "/api/boom", null, emptyMap())
        assertNotNull(result)
        assertEquals(500, result!!.status)
        assert(result.body.contains("kaboom"))
    }
}
