// Docs: docs/contributing/workflows/add-native-api/CONTEXT.md, docs/concepts/architecture.md
package dev.capsule.handlers

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive

/**
 * Lenient accessors for JSON-RPC params, shared by every bridge handler.
 *
 * They read a value as a primitive and coerce, returning `null` when the key is
 * absent or JSON `null` — so optional params Just Work without each handler
 * re-implementing the same null-guarding. Bridge params are plain objects, so
 * the receiver is [JsonObject] (which is a `Map<String, JsonElement>`).
 */
internal fun JsonObject.optString(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull()

internal fun JsonObject.optDouble(key: String): Double? = optString(key)?.toDoubleOrNull()

internal fun JsonObject.optInt(key: String): Int? = optString(key)?.toDoubleOrNull()?.toInt()

internal fun JsonObject.optBool(key: String): Boolean? = optString(key)?.toBooleanStrictOrNull()

// jsonPrimitive.content throws on JsonNull; guard it so absent/null params are tolerated.
private fun JsonPrimitive.contentOrNull(): String? = if (this is JsonNull) null else content
