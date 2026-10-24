// Docs: docs/guide/database.md
package dev.capsule.db

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/**
 * [AndroidDbProvider] against the device's real SQLite — typed binding, result shapes,
 * transactions spanning calls, and error mapping. Handler/wire mapping is covered on the JVM by
 * DbHandlerTest.
 */
@RunWith(AndroidJUnit4::class)
class AndroidDbProviderTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "test-${UUID.randomUUID()}.db"
    private lateinit var db: AndroidDbProvider

    @Before fun setUp() = runBlocking {
        db = AndroidDbProvider(context, name)
        db.sql(SqlStatement("CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER, r REAL, s TEXT, b BLOB)"))
        Unit
    }

    @After fun tearDown() {
        context.deleteDatabase(name)
    }

    private fun insert(vararg params: SqlValue) = runBlocking {
        db.sql(SqlStatement("INSERT INTO t (n, r, s, b) VALUES (?, ?, ?, ?)", params.toList()))
    }

    private fun rows(sql: String, vararg params: SqlValue) =
        (runBlocking { db.sql(SqlStatement(sql, params.toList())) } as SqlResult.Rows).rows

    @Test fun ddl_changes_no_rows_and_inserts_report_their_rowid() {
        val created = runBlocking { db.sql(SqlStatement("CREATE TABLE other (x)")) }
        assertEquals(SqlResult.Run(rowsAffected = 0, insertId = null), created)

        assertEquals(SqlResult.Run(rowsAffected = 1, insertId = 1), insert(SqlValue.Integer(1), SqlValue.Null, SqlValue.Null, SqlValue.Null))
        assertEquals(SqlResult.Run(rowsAffected = 1, insertId = 2), insert(SqlValue.Integer(2), SqlValue.Null, SqlValue.Null, SqlValue.Null))
    }

    @Test fun an_insert_repeating_the_previous_rowid_still_reports_it() = runBlocking {
        insert(SqlValue.Integer(1), SqlValue.Null, SqlValue.Null, SqlValue.Null) // t's rowid 1
        db.sql(SqlStatement("CREATE TABLE u (x)"))
        assertEquals(SqlResult.Run(rowsAffected = 1, insertId = 1), db.sql(SqlStatement("INSERT INTO u VALUES (1)")))
        // …and a statement that inserts nothing leaves last_insert_rowid() where it was.
        assertEquals(SqlResult.Run(rowsAffected = 1, insertId = null), db.sql(SqlStatement("UPDATE u SET x = 2")))
        assertEquals(listOf(mapOf("id" to SqlValue.Integer(1))), rows("SELECT last_insert_rowid() AS id"))
    }

    @Test fun every_storage_class_round_trips_with_its_type() {
        insert(SqlValue.Integer(Long.MAX_VALUE), SqlValue.Real(2.5), SqlValue.Text("héllo"), SqlValue.Blob(byteArrayOf(0, 1, -1)))
        insert(SqlValue.Null, SqlValue.Null, SqlValue.Null, SqlValue.Null)

        val all = rows("SELECT n, r, s, b FROM t ORDER BY id")

        assertEquals(
            listOf(
                mapOf("n" to SqlValue.Integer(Long.MAX_VALUE), "r" to SqlValue.Real(2.5), "s" to SqlValue.Text("héllo"), "b" to SqlValue.Blob(byteArrayOf(0, 1, -1))),
                mapOf("n" to SqlValue.Null, "r" to SqlValue.Null, "s" to SqlValue.Null, "b" to SqlValue.Null),
            ),
            all,
        )
    }

    @Test fun params_bind_with_their_type_not_as_strings() {
        insert(SqlValue.Integer(10), SqlValue.Null, SqlValue.Null, SqlValue.Null)
        insert(SqlValue.Integer(9), SqlValue.Null, SqlValue.Null, SqlValue.Null)

        // Bound as INTEGER, not TEXT: arithmetic and numeric comparison work on the raw parameter.
        assertEquals(listOf(mapOf("n" to SqlValue.Integer(10))), rows("SELECT n FROM t WHERE n > ?", SqlValue.Integer(9)))
        assertEquals(listOf(mapOf("x" to SqlValue.Integer(3))), rows("SELECT ? + 1 AS x", SqlValue.Integer(2)))
    }

    @Test fun updates_report_rows_affected() {
        repeat(3) { insert(SqlValue.Integer(1), SqlValue.Null, SqlValue.Null, SqlValue.Null) }

        val result = runBlocking { db.sql(SqlStatement("UPDATE t SET n = ? WHERE n = ?", listOf(SqlValue.Integer(2), SqlValue.Integer(1)))) }

        assertEquals(SqlResult.Run(rowsAffected = 3, insertId = null), result)
    }

    @Test fun a_select_with_no_matches_is_an_empty_row_list() {
        assertEquals(emptyList<SqlRow>(), rows("SELECT * FROM t"))
    }

    @Test fun pragmas_work_both_ways() {
        runBlocking { db.sql(SqlStatement("PRAGMA user_version = 3")) }
        assertEquals(listOf(mapOf("user_version" to SqlValue.Integer(3))), rows("PRAGMA user_version"))
    }

    // ── transactions ──────────────────────────────────────────────────────────

    @Test fun a_committed_transaction_keeps_its_writes() = runBlocking {
        db.begin()
        insert(SqlValue.Integer(1), SqlValue.Null, SqlValue.Null, SqlValue.Null)
        db.commit()

        assertEquals(1, rows("SELECT * FROM t").size)
    }

    @Test fun a_rolled_back_transaction_discards_its_writes() = runBlocking {
        db.begin()
        insert(SqlValue.Integer(1), SqlValue.Null, SqlValue.Null, SqlValue.Null)
        db.rollback()

        assertTrue(rows("SELECT * FROM t").isEmpty())
    }

    @Test fun begin_rolls_back_a_transaction_left_open() = runBlocking {
        db.begin()
        insert(SqlValue.Integer(1), SqlValue.Null, SqlValue.Null, SqlValue.Null) // the JS context "dies" here
        db.begin()
        db.commit()

        assertTrue(rows("SELECT * FROM t").isEmpty())
    }

    @Test fun commit_without_a_transaction_is_a_sql_error() = runBlocking {
        expectSqlError { db.commit() }
        Unit
    }

    // ── errors ────────────────────────────────────────────────────────────────

    @Test fun sqlite_errors_surface_as_sql_error_with_the_engine_message() = runBlocking {
        val e = expectSqlError { db.sql(SqlStatement("SELECT * FROM missing")) }
        assertTrue(e.detail!!.contains("no such table"))
    }

    @Test fun more_params_than_placeholders_is_a_sql_error() = runBlocking {
        expectSqlError { db.sql(SqlStatement("SELECT ?", listOf(SqlValue.Integer(1), SqlValue.Integer(2)))) }
        Unit
    }

    private suspend fun expectSqlError(block: suspend () -> Unit): CapsuleException {
        try {
            block()
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.SqlError, e.error)
            return e
        }
        fail("expected SQL_ERROR")
        throw AssertionError()
    }
}
