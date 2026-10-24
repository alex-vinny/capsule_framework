// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Integration tests for QuickJSBridge.
 *
 * Two non-obvious constraints from the C JNI layer:
 *
 * 1. globalThis is the only reliable store across evaluate→call boundaries.
 *    Top-level `var` bindings and function-object properties are not reliably visible
 *    inside functions called via engine.call(). The C helper uses globalThis[fn] to
 *    resolve functions, so globalThis is the canonical global namespace.
 *
 * 2. JS dispatch() must return a plain object (not a JSON string).
 *    The C helper wraps every return value in JSON.stringify(), so returning an object
 *    produces clean JSON (e.g. {"jsonrpc":"2.0",...}). Returning a pre-serialised string
 *    produces a double-encoded result (e.g. "{\"jsonrpc\":\"2.0\",...}") which the
 *    WebView cannot directly use.
 */
@RunWith(AndroidJUnit4::class)
class QuickJSBridgeTest {

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

    /**
     * Router script for tests. Two design choices explained in the class doc above:
     *  - Routes stored in globalThis.__capsule_routes (not a closure var or fn property)
     *  - dispatch() returns a plain JS object, not a JSON string
     */
    private fun routerScript(vararg extraHandlers: String) = buildString {
        append(
            """
            globalThis.__capsule_routes = {};
            function dispatch(requestJson) {
                var r = globalThis.__capsule_routes;
                if (!r) return null;
                var req;
                try { req = JSON.parse(requestJson); } catch(e) { return null; }
                var handler = r[req.method];
                if (!handler) return null;
                try {
                    var result = handler(req.params != null ? req.params : null);
                    return { jsonrpc: "2.0", id: req.id || null, result: result };
                } catch(e) {
                    return { jsonrpc: "2.0", id: req.id || null, error: { code: 1003, message: String(e.message || e) } };
                }
            }
            function addRoute(method, handler) {
                globalThis.__capsule_routes[method] = handler;
            }
            """.trimIndent()
        )
        extraHandlers.forEach { append('\n'); append(it) }
    }

    private fun makeRequest(method: String, id: String = "test-1") =
        """{"jsonrpc":"2.0","id":"$id","method":"$method","params":{}}"""

    @Test
    fun handleRequest_unregisteredMethod_returnsNull() = runTest {
        engine.evaluate(routerScript())
        val result = bridge.handleRequest(makeRequest("device.getInfo"))
        assertNull(result)
    }

    @Test
    fun handleRequest_registeredMethod_returnsJsonRpcResponse() = runTest {
        engine.evaluate(
            routerScript("""addRoute("custom.echo", function(params) { return params; });""")
        )

        val result = bridge.handleRequest(
            """{"jsonrpc":"2.0","id":"echo-1","method":"custom.echo","params":{"msg":"hello"}}"""
        )

        assertNotNull(result)
        assertTrue(result!!.contains(""""id":"echo-1""""))
        assertTrue(result.contains(""""msg":"hello""""))
    }

    @Test
    fun handleRequest_handlerThrows_returnsErrorResponse() = runTest {
        engine.evaluate(
            routerScript("""addRoute("custom.boom", function(params) { throw new Error("kaboom"); });""")
        )

        val result = bridge.handleRequest(makeRequest("custom.boom", id = "err-1"))

        assertNotNull(result)
        assertTrue(result!!.contains(""""error""""))
        assertTrue(result.contains("kaboom"))
    }

    @Test
    fun handleRequest_jsHandlerTakesPriorityOverKotlin() = runTest {
        engine.evaluate(
            routerScript("""addRoute("device.getInfo", function() { return { platform: "quickjs" }; });""")
        )

        val result = bridge.handleRequest(makeRequest("device.getInfo"))

        assertNotNull(result)
        assertTrue(result!!.contains(""""platform":"quickjs""""))
    }
}
