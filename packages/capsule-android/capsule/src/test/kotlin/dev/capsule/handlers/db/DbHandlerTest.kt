// Docs: docs/guide/database.md
package dev.capsule.handlers.db

import dev.capsule.db.SqlResult
import dev.capsule.db.SqlStatement
import dev.capsule.db.SqlValue
import dev.capsule.fakes.FakeDbProvider
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class DbHandlerTest {

    private suspend fun expectSqlError(block: suspend () -> Unit): CapsuleException {
        try {
            block()
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.SqlError, e.error)
            return e
        }
        fail("expected a SQL_ERROR CapsuleException")
        throw AssertionError()
    }

    // ── db.sql: params in ─────────────────────────────────────────────────────

    @Test
    fun `sql forwards the statement with typed params`() = runTest {
        val fake = FakeDbProvider()
        DbSqlHandler(fake).handle(
            buildJsonObject {
                put("sql", "INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)")
                put("params", buildJsonArray {
                    add(JsonNull)
                    add(JsonPrimitive(42))
                    add(JsonPrimitive(1.5))
                    add(JsonPrimitive("ü"))
                    add(JsonPrimitive(true))
                    add(buildJsonObject { put("\$blob", "AQID") })
                })
            }
        )

        assertEquals(
            SqlStatement(
                "INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)",
                listOf(
                    SqlValue.Null,
                    SqlValue.Integer(42),
                    SqlValue.Real(1.5),
                    SqlValue.Text("ü"),
                    SqlValue.Integer(1),
                    SqlValue.Blob(byteArrayOf(1, 2, 3)),
                ),
            ),
            fake.statements.single(),
        )
    }

    @Test
    fun `sql without params forwards an empty list`() = runTest {
        val fake = FakeDbProvider()
        DbSqlHandler(fake).handle(buildJsonObject { put("sql", "SELECT 1") })

        assertEquals(SqlStatement("SELECT 1"), fake.statements.single())
    }

    @Test
    fun `missing sql is a SQL_ERROR`() = runTest {
        val e = expectSqlError { DbSqlHandler(FakeDbProvider()).handle(JsonObject(emptyMap())) }
        assertEquals("sql required", e.detail)
    }

    @Test
    fun `unsupported param types are a SQL_ERROR naming the position`() = runTest {
        val handler = DbSqlHandler(FakeDbProvider())
        val array = expectSqlError {
            handler.handle(buildJsonObject {
                put("sql", "SELECT ?, ?")
                put("params", buildJsonArray { add(JsonPrimitive(1)); add(buildJsonArray { }) })
            })
        }
        assertEquals("Parameter 2: unsupported value type", array.detail)

        val obj = expectSqlError {
            handler.handle(buildJsonObject {
                put("sql", "SELECT ?")
                put("params", buildJsonArray { add(buildJsonObject { put("x", 1) }) })
            })
        }
        assertEquals("Parameter 1: unsupported value type", obj.detail)
    }

    // ── db.sql: results out ───────────────────────────────────────────────────

    @Test
    fun `rows come back as objects with typed values and base64 blobs`() = runTest {
        val fake = FakeDbProvider(
            result = SqlResult.Rows(
                listOf(
                    linkedMapOf(
                        "id" to SqlValue.Integer(7),
                        "score" to SqlValue.Real(2.5),
                        "name" to SqlValue.Text("a"),
                        "note" to SqlValue.Null,
                        "data" to SqlValue.Blob(byteArrayOf(1, 2, 3)),
                    ),
                ),
            ),
        )

        val result = DbSqlHandler(fake).handle(buildJsonObject { put("sql", "SELECT * FROM t") })

        assertEquals(
            Json.parseToJsonElement(
                """{"rows":[{"id":7,"score":2.5,"name":"a","note":null,"data":{"${'$'}blob":"AQID"}}]}"""
            ),
            result,
        )
    }

    @Test
    fun `a write returns rowsAffected and insertId only when a row was inserted`() = runTest {
        val handler = DbSqlHandler(FakeDbProvider(result = SqlResult.Run(rowsAffected = 1, insertId = 9)))
        assertEquals(
            Json.parseToJsonElement("""{"rowsAffected":1,"insertId":9}"""),
            handler.handle(buildJsonObject { put("sql", "INSERT INTO t DEFAULT VALUES") }),
        )

        val update = DbSqlHandler(FakeDbProvider(result = SqlResult.Run(rowsAffected = 3, insertId = null)))
        assertEquals(
            Json.parseToJsonElement("""{"rowsAffected":3}"""),
            update.handle(buildJsonObject { put("sql", "UPDATE t SET x = 1") }),
        )
    }

    @Test
    fun `provider errors propagate unchanged`() = runTest {
        val fake = FakeDbProvider(failure = CapsuleException(BridgeError.SqlError, "no such table: t"))

        val e = expectSqlError { DbSqlHandler(fake).handle(buildJsonObject { put("sql", "SELECT * FROM t") }) }

        assertEquals("no such table: t", e.detail)
    }

    // ── transactions ──────────────────────────────────────────────────────────

    @Test
    fun `begin, commit and rollback reach the provider in order`() = runTest {
        val fake = FakeDbProvider()
        val handlers = dbHandlers(fake).associateBy { it.method }

        handlers.getValue("db.begin").handle(JsonObject(emptyMap()))
        handlers.getValue("db.sql").handle(buildJsonObject { put("sql", "DELETE FROM t") })
        handlers.getValue("db.commit").handle(JsonObject(emptyMap()))
        handlers.getValue("db.rollback").handle(JsonObject(emptyMap()))

        assertEquals(listOf("begin", "sql", "commit", "rollback"), fake.calls)
        assertTrue(handlers.keys.containsAll(listOf("db.sql", "db.begin", "db.commit", "db.rollback")))
    }
}
