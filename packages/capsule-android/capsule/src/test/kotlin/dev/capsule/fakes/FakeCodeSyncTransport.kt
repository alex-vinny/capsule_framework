package dev.capsule.fakes

import dev.capsule.codesync.CodeSyncTransport
import dev.capsule.codesync.TransportResult
import java.io.IOException

/**
 * Scriptable in-memory [CodeSyncTransport]. Tests queue responses per URL and inspect
 * the requests that were made — no sockets involved.
 */
class FakeCodeSyncTransport : CodeSyncTransport {

    class Request(val url: String, val method: String, val body: String?)

    val requests = mutableListOf<Request>()

    /** URL → queue of responses (a URL may be requested more than once). */
    private val responses = mutableMapOf<String, ArrayDeque<ScriptedResponse>>()

    /** Thrown by the transport when told to simulate a network failure for a URL. */
    private val failures = mutableMapOf<String, IOException>()
    fun enqueue(url: String, code: Int, body: ByteArray) {
        responses.getOrPut(url) { ArrayDeque() }.addLast(ScriptedResponse(code, body))
    }

    fun enqueueJson(url: String, code: Int, body: String) = enqueue(url, code, body.toByteArray())

    fun failWith(url: String, error: IOException) {
        failures[url] = error
    }

    /** Rotates the LAST enqueued response for [url] to the front of its queue, so a test
     *  can consume a sabotaged response before the fixture's good one (queues are FIFO). */
    fun rotateCheckToFirst(url: String) {
        val queue = responses[url] ?: throw AssertionError("no responses queued for $url")
        val last = queue.removeLast()
        queue.addFirst(last)
    }

    private fun next(url: String): ScriptedResponse =
        responses[url]?.removeFirstOrNull()
            ?: throw AssertionError("no scripted response for $url")

    override suspend fun get(url: String): TransportResult {
        requests.add(Request(url, "GET", body = null))
        failures[url]?.let { throw it }
        val scripted = next(url)
        return TransportResult(scripted.code, scripted.body)
    }

    override suspend fun postJson(url: String, jsonBody: String): TransportResult {
        requests.add(Request(url, "POST", body = jsonBody))
        failures[url]?.let { throw it }
        val scripted = next(url)
        return TransportResult(scripted.code, scripted.body)
    }

    private data class ScriptedResponse(val code: Int, val body: ByteArray)
}
