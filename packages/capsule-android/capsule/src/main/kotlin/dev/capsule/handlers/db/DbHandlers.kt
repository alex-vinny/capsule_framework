// Docs: docs/guide/database.md
package dev.capsule.handlers.db

import dev.capsule.db.DbProvider
import dev.capsule.db.SqlResult
import dev.capsule.db.SqlStatement
import dev.capsule.db.SqlValue
import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.handlers.optString
import dev.capsule.protocol.BridgeError
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.util.Base64

// Wire format (mirrors @capsule/core db.ts): params are JSON null / number / string, or
// { "$blob": "<base64>" }; booleans are already 0/1. Results: { rows: [...] } for statements that
// return columns, else { rowsAffected, insertId? }.

// ─── Handlers ────────────────────────────────────────────────────────────────

class DbSqlHandler(private val provider: DbProvider) : BridgeHandler {
    override val method = "db.sql"
    override suspend fun handle(params: JsonElement): JsonElement =
        provider.sql(params.jsonObject.toStatement()).toJson()
}

class DbBeginHandler(private val provider: DbProvider) : BridgeHandler {
    override val method = "db.begin"
    override suspend fun handle(params: JsonElement): JsonElement {
        provider.begin()
        return JsonObject(emptyMap())
    }
}

class DbCommitHandler(private val provider: DbProvider) : BridgeHandler {
    override val method = "db.commit"
    override suspend fun handle(params: JsonElement): JsonElement {
        provider.commit()
        return JsonObject(emptyMap())
    }
}

class DbRollbackHandler(private val provider: DbProvider) : BridgeHandler {
    override val method = "db.rollback"
    override suspend fun handle(params: JsonElement): JsonElement {
        provider.rollback()
        return JsonObject(emptyMap())
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun dbHandlers(provider: DbProvider): List<BridgeHandler> =
    listOf(
        DbSqlHandler(provider),
        DbBeginHandler(provider),
        DbCommitHandler(provider),
        DbRollbackHandler(provider),
    )

// ─── Wire mapping ────────────────────────────────────────────────────────────

private const val BLOB_KEY = "\$blob"

private fun JsonObject.toStatement(): SqlStatement {
    val sql = optString("sql")?.takeIf { it.isNotBlank() }
        ?: throw CapsuleException(BridgeError.SqlError, "sql required")
    val params = (this["params"] as? JsonArray).orEmpty().mapIndexed { i, value -> value.toSqlValue(i + 1) }
    return SqlStatement(sql, params)
}

private fun JsonElement.toSqlValue(position: Int): SqlValue = when (this) {
    is JsonNull -> SqlValue.Null
    is JsonPrimitive -> when {
        isString -> SqlValue.Text(content)
        booleanOrNull != null -> SqlValue.Integer(if (boolean) 1 else 0)
        else -> content.toLongOrNull()?.let { SqlValue.Integer(it) }
            ?: content.toDoubleOrNull()?.let { SqlValue.Real(it) }
            ?: unsupported(position)
    }
    is JsonObject -> (this[BLOB_KEY] as? JsonPrimitive)?.takeIf { it.isString }?.let { blob ->
        try {
            SqlValue.Blob(Base64.getDecoder().decode(blob.content))
        } catch (_: IllegalArgumentException) {
            throw CapsuleException(BridgeError.SqlError, "Parameter $position: invalid base64 blob")
        }
    } ?: unsupported(position)
    is JsonArray -> unsupported(position)
}

private fun unsupported(position: Int): Nothing =
    throw CapsuleException(BridgeError.SqlError, "Parameter $position: unsupported value type")

private fun SqlResult.toJson(): JsonElement = when (this) {
    is SqlResult.Rows -> buildJsonObject {
        put("rows", JsonArray(rows.map { row -> JsonObject(row.mapValues { it.value.toJson() }) }))
    }
    is SqlResult.Run -> buildJsonObject {
        put("rowsAffected", rowsAffected)
        insertId?.let { put("insertId", it) }
    }
}

private fun SqlValue.toJson(): JsonElement = when (this) {
    SqlValue.Null -> JsonNull
    is SqlValue.Integer -> JsonPrimitive(value)
    is SqlValue.Real -> JsonPrimitive(value)
    is SqlValue.Text -> JsonPrimitive(value)
    is SqlValue.Blob -> buildJsonObject { put(BLOB_KEY, Base64.getEncoder().encodeToString(bytes)) }
}
