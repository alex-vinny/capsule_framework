// Docs: docs/concepts/architecture.md
package dev.capsule

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.*
import dev.capsule.runtime.QuickJSBridge
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class CapsuleBridge(
    private val scope: CoroutineScope,
    val config: CapsuleShellConfig,
    handlers: List<BridgeHandler>,
) {
    private companion object {
        const val TAG = "CapsuleBridge"
    }

    private val json = Json { ignoreUnknownKeys = true }
    internal val registry = mutableMapOf<String, BridgeHandler>()
    private lateinit var webView: WebView
    @Volatile private var quickJsBridge: QuickJSBridge? = null

    init {
        handlers.forEach { it.register(registry) }
    }

    fun attachWebView(wv: WebView) {
        webView = wv
    }

    fun attachQuickJsBridge(qjb: QuickJSBridge) {
        quickJsBridge = qjb
    }

    @JavascriptInterface
    fun postMessage(raw: String) {
        scope.launch {
            // 1. JS route handlers via QuickJS (release/embedded only; null in dev).
            val qjsResponse = quickJsBridge?.handleRequest(raw)
            if (qjsResponse != null) {
                dispatch(qjsResponse)
                return@launch
            }

            val request =
                try {
                    json.decodeFromString<JsonRpcRequest>(raw)
                } catch (e: Exception) {
                    return@launch sendError(null, BridgeError.ParseError)
                }

            // 2. Native Kotlin handlers (built-in APIs: device, alerts, storage, ...).
            val handler = registry[request.method]
            if (handler != null) {
                try {
                    val result = handler.handle(request.params)
                    if (request.id != null) sendSuccess(request.id, result)
                } catch (e: CapsuleException) {
                    sendError(request.id, e.error, e.detail)
                } catch (e: Exception) {
                    sendError(request.id, BridgeError.InternalError, e.message)
                }
                return@launch
            }

            // 3. Dev mode: forward unknown methods to the dev route sidecar, so
            //    file-based src/routes/*.ts work on-device the same as in the
            //    browser. QuickJS isn't running in dev, so this is the only path
            //    to developer-defined JSON-RPC routes (reached via adb reverse).
            val devUrl = config.devServerUrl
            if (devUrl != null) {
                Log.d(TAG, "no native handler for '${request.method}', forwarding to sidecar at $devUrl")
                forwardToSidecar(devUrl, request)
                return@launch
            }

            // 4. Nothing matched.
            Log.w(TAG, "no handler for '${request.method}' and devServerUrl is null (embedded mode)")
            sendError(request.id, BridgeError.MethodNotFound, "Unknown method: ${request.method}")
        }
    }

    /**
     * Forwards a JSON-RPC [request] to the dev route sidecar's /_capsule/rpc and
     * relays the response. Translates between the native envelope (jsonrpc/id) and
     * the sidecar's bare {method, params} -> raw-result contract.
     */
    private suspend fun forwardToSidecar(devUrl: String, request: JsonRpcRequest) {
        val body =
            buildJsonObject {
                put("method", request.method)
                put("params", request.params)
            }.toString()

        val target = "${devUrl.trimEnd('/')}/_capsule/rpc"
        val (code, text) = postToSidecar(target, body)
        Log.d(TAG, "sidecar '${request.method}' -> HTTP $code, body=${text?.take(200)}")
        when {
            code in 200..299 && text != null -> {
                val result =
                    try {
                        json.parseToJsonElement(text)
                    } catch (e: Exception) {
                        return sendError(request.id, BridgeError.InternalError, "Bad sidecar response")
                    }
                if (request.id != null) sendSuccess(request.id, result)
            }
            code == 404 ->
                sendError(request.id, BridgeError.MethodNotFound, "Unknown method: ${request.method}")
            else ->
                sendError(request.id, BridgeError.InternalError, text ?: "Dev sidecar unreachable")
        }
    }

    /** POSTs [body] as JSON to [url]; returns (httpStatus, responseBody). status -1 on failure. */
    private suspend fun postToSidecar(url: String, body: String): Pair<Int, String?> =
        withContext(Dispatchers.IO) {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 5_000
                    readTimeout = 10_000
                    setRequestProperty("Content-Type", "application/json")
                }
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val responseText = stream?.bufferedReader()?.use { it.readText() }
                code to responseText
            } catch (e: Exception) {
                -1 to e.message
            } finally {
                conn?.disconnect()
            }
        }

    fun sendNotification(method: String, params: JsonElement) {
        dispatch(json.encodeToString(JsonRpcNotification(method = method, params = params)))
    }

    private fun sendSuccess(id: String, result: JsonElement) {
        dispatch(json.encodeToString(JsonRpcSuccessResponse(id = id, result = result)))
    }

    data class CodeSyncCheckResult(
        val status: String = "idle",
        val update: BundleInfo? = null
    )

    data class BundleInfo(
        val id: String = "",
        val url: String = "",
        val hashSha256: String = "",
        val sizeBytes: Long = 0,
        val version: String = "",
        val buildNumber: Long = 0,
        val rolloutPercent: Int = 0
    )

    private fun sendError(id: String?, error: BridgeError, detail: String? = null) {
        dispatch(
            json.encodeToString(
                JsonRpcErrorResponse(
                    id = id,
                    error = JsonRpcErrorPayload(code = error.code, message = error.message, data = detail),
                )
            )
        )
    }

    /**
     * A notification can fire before the page's bundle has created the JS bridge, or on a page
     * that never loads @capsule/core. Nothing listens yet then (launch data is pulled — see
     * app.getLaunchUrl), so it is dropped instead of throwing a TypeError in the page.
     */
    private fun dispatch(payload: String) {
        webView.post {
            webView.evaluateJavascript(
                "window.__capsuleReceive && window.__capsuleReceive(${json.encodeToString(payload)})",
                null,
            )
        }
    }
}
