package dev.capsule.fakes

import dev.capsule.runtime.HttpRouteResponse
import dev.capsule.runtime.QuickJSBridge

class FakeQuickJSBridge : QuickJSBridge {
    var loadCallCount = 0
    val handleRequests = mutableListOf<String>()
    var handleResult: String? = null

    val httpRequests = mutableListOf<HttpRequestRecord>()
    var httpResult: HttpRouteResponse? = null

    data class HttpRequestRecord(
        val method: String,
        val path: String,
        val body: String?,
        val headers: Map<String, String>,
    )

    override suspend fun load() {
        loadCallCount++
    }

    override suspend fun handleRequest(requestJson: String): String? {
        handleRequests.add(requestJson)
        return handleResult
    }

    override suspend fun handleHttpRequest(
        method: String,
        path: String,
        body: String?,
        headers: Map<String, String>,
    ): HttpRouteResponse? {
        httpRequests.add(HttpRequestRecord(method, path, body, headers))
        return httpResult
    }
}
