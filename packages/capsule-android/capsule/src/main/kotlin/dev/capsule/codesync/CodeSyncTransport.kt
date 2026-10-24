// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Raw HTTP transport for the CodeSync client — the only seam the manager needs for network.
 * The manager owns URL building, decoding, and flow control; the transport moves bytes.
 * A fake in the unit tests drives every flow without sockets.
 */
interface CodeSyncTransport {
    /** Fetch [url]; [TransportResult.code] is the HTTP status (transport failures throw [IOException]). */
    suspend fun get(url: String): TransportResult

    /** POST [jsonBody] to [url] (fire-and-forget callers ignore the result). */
    suspend fun postJson(url: String, jsonBody: String): TransportResult
}

class TransportResult(val code: Int, val body: ByteArray)

class OkHttpCodeSyncTransport(
    private val client: OkHttpClient = OkHttpClient(),
) : CodeSyncTransport {

    override suspend fun get(url: String): TransportResult = withContext(Dispatchers.IO) {
        val response = client.newCall(Request.Builder().url(url).build()).execute()
        response.use { result ->
            TransportResult(result.code, result.body?.bytes() ?: ByteArray(0))
        }
    }

    override suspend fun postJson(url: String, jsonBody: String): TransportResult =
        withContext(Dispatchers.IO) {
            val body = jsonBody.toRequestBody("application/json".toMediaType())
            val response = client.newCall(Request.Builder().url(url).post(body).build()).execute()
            response.use { result ->
                TransportResult(result.code, result.body?.bytes() ?: ByteArray(0))
            }
        }
}
