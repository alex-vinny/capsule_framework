// Docs: docs/concepts/architecture.md
package dev.capsule.protocol

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class JsonRpcRequest(
    val jsonrpc: String = "2.0",
    val id: String? = null,
    val method: String,
    val params: JsonElement = JsonObject(emptyMap())
)

@Serializable
data class JsonRpcSuccessResponse(
    val jsonrpc: String = "2.0",
    val id: String?,
    val result: JsonElement
)

@Serializable
data class JsonRpcErrorResponse(
    val jsonrpc: String = "2.0",
    val id: String?,
    val error: JsonRpcErrorPayload
)

@Serializable
data class JsonRpcErrorPayload(
    val code: Int,
    val message: String,
    val data: String? = null
)

@Serializable
data class JsonRpcNotification(
    val jsonrpc: String = "2.0",
    val method: String,
    val params: JsonElement = JsonObject(emptyMap())
)
