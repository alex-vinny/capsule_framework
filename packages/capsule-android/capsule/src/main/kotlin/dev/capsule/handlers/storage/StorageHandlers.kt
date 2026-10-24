// Docs: docs/reference/core-api.md
package dev.capsule.handlers.storage

import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import dev.capsule.storage.StorageProvider
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

// ─── Param / result models ───────────────────────────────────────────────────

@Serializable internal data class KeyParams(val key: String)

@Serializable internal data class SetParams(val key: String, val value: String)

@Serializable data class GetResult(val value: String?)

@Serializable data class KeysResult(val keys: List<String>)

// ─── Handlers ────────────────────────────────────────────────────────────────

class StorageGetHandler(private val provider: StorageProvider) : BridgeHandler {
    override val method = "storage.get"

    override suspend fun handle(params: JsonElement): JsonElement {
        val p = Json.decodeFromJsonElement<KeyParams>(params)
        return Json.encodeToJsonElement(GetResult(provider.get(p.key)))
    }
}

class StorageSetHandler(private val provider: StorageProvider) : BridgeHandler {
    override val method = "storage.set"

    override suspend fun handle(params: JsonElement): JsonElement {
        val p = Json.decodeFromJsonElement<SetParams>(params)
        provider.set(p.key, p.value)
        return JsonObject(emptyMap())
    }
}

class StorageRemoveHandler(private val provider: StorageProvider) : BridgeHandler {
    override val method = "storage.remove"

    override suspend fun handle(params: JsonElement): JsonElement {
        val p = Json.decodeFromJsonElement<KeyParams>(params)
        provider.remove(p.key)
        return JsonObject(emptyMap())
    }
}

class StorageClearHandler(private val provider: StorageProvider) : BridgeHandler {
    override val method = "storage.clear"

    override suspend fun handle(params: JsonElement): JsonElement {
        provider.clear()
        return JsonObject(emptyMap())
    }
}

class StorageKeysHandler(private val provider: StorageProvider) : BridgeHandler {
    override val method = "storage.keys"

    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(KeysResult(provider.keys()))
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun storageHandlers(provider: StorageProvider): List<BridgeHandler> =
    listOf(
        StorageGetHandler(provider),
        StorageSetHandler(provider),
        StorageRemoveHandler(provider),
        StorageClearHandler(provider),
        StorageKeysHandler(provider),
    )
