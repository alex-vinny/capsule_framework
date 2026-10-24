// Docs: docs/concepts/primers/quickjs.md, docs/decisions/0001-embedded-runtime.md
package dev.capsule.runtime

import android.content.res.AssetManager
import android.util.Log
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.FileNotFoundException

private const val TAG = "CapsuleQuickJS"

class QuickJSBridgeImpl(
    private val engine: QuickJSEngine,
    private val assets: AssetManager,
) : QuickJSBridge {

    override suspend fun load() {
        val js = try {
            assets.open("server/bundle.js").bufferedReader().use { it.readText() }
        } catch (_: FileNotFoundException) {
            Log.w(TAG, "server/bundle.js not found — JS routing disabled. Run `capsule build android`.")
            return
        }
        engine.evaluate(js)
    }

    override suspend fun handleRequest(requestJson: String): String? {
        val quoted = JsonPrimitive(requestJson).toString()
        return try {
            val result = engine.call("dispatch", "[$quoted]")
            result.takeIf { it != "null" && it.isNotBlank() }
        } catch (e: QuickJSException) {
            Log.e(TAG, "QuickJS dispatch error: ${e.message}")
            null
        }
    }

    override suspend fun handleHttpRequest(
        method: String,
        path: String,
        body: String?,
        headers: Map<String, String>,
    ): HttpRouteResponse? {
        // Build args array: [method, path, body|null, headersObject]
        // Headers are passed as an inline JSON object so JS receives them as Record<string,string>
        // without needing JSON.parse — consistent with how QuickJS parses the args array.
        val methodArg  = JsonPrimitive(method).toString()
        val pathArg    = JsonPrimitive(path).toString()
        val bodyArg    = if (body != null) JsonPrimitive(body).toString() else "null"
        val headersObj = JsonObject(headers.mapValues { (_, v) -> JsonPrimitive(v) }).toString()

        val argsJson = "[$methodArg,$pathArg,$bodyArg,$headersObj]"

        return try {
            val result = engine.call("handleHttpRequest", argsJson)
            if (result == "null" || result.isBlank()) return null

            val json = Json.parseToJsonElement(result).jsonObject
            HttpRouteResponse(
                status   = json["status"]?.jsonPrimitive?.int ?: 200,
                body     = json["body"]?.jsonPrimitive?.content ?: "",
                mimeType = json["mimeType"]?.jsonPrimitive?.content ?: "application/json",
            )
        } catch (e: QuickJSException) {
            Log.e(TAG, "QuickJS handleHttpRequest error: ${e.message}")
            null
        } catch (e: Exception) {
            Log.e(TAG, "handleHttpRequest parse error: ${e.message}")
            null
        }
    }
}
