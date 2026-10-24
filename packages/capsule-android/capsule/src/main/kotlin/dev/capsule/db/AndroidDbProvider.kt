// Docs: docs/guide/database.md
package dev.capsule.db

import android.content.Context
import android.database.Cursor
import android.database.SQLException
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.ExecutorCoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.Executors

/**
 * [DbProvider] over the platform `SQLiteDatabase`, stored at the app's standard database path
 * (`databases/capsule.db`) — outside the OTA bundle dirs under `filesDir/bundles`.
 *
 * Every operation runs on one dedicated thread: `SQLiteDatabase` binds a transaction to the thread
 * that began it, and a Capsule transaction spans several bridge calls. The connection and thread
 * are process-wide, so a recreated Activity reuses them instead of opening a second connection.
 */
class AndroidDbProvider(
    context: Context,
    name: String = DATABASE_NAME,
) : DbProvider {

    private val file: File = context.getDatabasePath(name)

    override suspend fun sql(statement: SqlStatement): SqlResult = onDbThread { db -> run(db, statement) }

    override suspend fun begin() = onDbThread { db ->
        while (db.inTransaction()) db.endTransaction() // not marked successful → rolled back
        db.beginTransactionNonExclusive()
    }

    override suspend fun commit() = onDbThread { db ->
        if (!db.inTransaction()) throw CapsuleException(BridgeError.SqlError, "No transaction is open")
        db.setTransactionSuccessful()
        db.endTransaction()
    }

    override suspend fun rollback() = onDbThread { db ->
        if (db.inTransaction()) db.endTransaction()
    }

    private fun run(db: SQLiteDatabase, statement: SqlStatement): SqlResult {
        // rawQuery binds only Strings; a cursor factory binds typed values on the SQLiteQuery.
        // Column names are known once prepared, before anything executes.
        val factory = SQLiteDatabase.CursorFactory { _, driver, editTable, query ->
            query.bindAll(statement.params)
            SQLiteCursor(driver, editTable, query)
        }
        // editTable is @NonNull since API 36; only the long-deprecated cursor-update APIs read it.
        val rows = db.rawQueryWithFactory(factory, statement.sql, null, "").use { cursor ->
            if (cursor.columnCount == 0) null else cursor.readRows()
        }
        if (rows != null) return SqlResult.Rows(rows)

        // Comparing last_insert_rowid() before and after can't tell an insert that repeats the
        // previous rowid (another table's row 1 — or android_metadata's, written on open) from no
        // insert, so it is set to a value no insert produces, and put back when none happened.
        val idBefore = db.scalar("SELECT last_insert_rowid()")
        db.setLastInsertRowid(NO_ROWID)
        try {
            val changesBefore = db.scalar("SELECT total_changes()")
            db.compileStatement(statement.sql).use {
                it.bindAll(statement.params)
                it.execute()
            }
            val idAfter = db.scalar("SELECT last_insert_rowid()")
            return SqlResult.Run(
                rowsAffected = db.scalar("SELECT total_changes()") - changesBefore,
                insertId = idAfter.takeIf { it != NO_ROWID },
            )
        } finally {
            if (db.scalar("SELECT last_insert_rowid()") == NO_ROWID) db.setLastInsertRowid(idBefore)
        }
    }

    private suspend fun <T> onDbThread(block: (SQLiteDatabase) -> T): T = withContext(dbThread) {
        try {
            block(open(file))
        } catch (e: SQLException) {
            throw CapsuleException(BridgeError.SqlError, e.message)
        } catch (e: IllegalArgumentException) { // e.g. more params than placeholders
            throw CapsuleException(BridgeError.SqlError, e.message)
        }
    }

    private companion object {
        const val DATABASE_NAME = "capsule.db"

        /** "Nothing inserted" for last_insert_rowid(); a real rowid only if inserted explicitly. */
        const val NO_ROWID = Long.MIN_VALUE

        val dbThread: ExecutorCoroutineDispatcher = Executors
            .newSingleThreadExecutor { task -> Thread(task, "capsule-db").apply { isDaemon = true } }
            .asCoroutineDispatcher()

        /** Open connections by path — touched only on [dbThread]. */
        val connections = HashMap<String, SQLiteDatabase>()

        fun open(file: File): SQLiteDatabase = connections.getOrPut(file.path) {
            file.parentFile?.mkdirs()
            SQLiteDatabase.openOrCreateDatabase(file, null).apply {
                // One connection, so total_changes() / last_insert_rowid() read after a statement
                // come from the connection that ran it (WAL would add a reader pool).
                disableWriteAheadLogging()
            }
        }
    }
}

private fun SQLiteDatabase.scalar(sql: String): Long = compileStatement(sql).use { it.simpleQueryForLong() }

/**
 * The platform API has no sqlite3_set_last_insert_rowid, but an insert sets it — so insert the
 * rowid into a per-connection TEMP table (in memory, never in the app's file) and delete it.
 */
private fun SQLiteDatabase.setLastInsertRowid(rowid: Long) {
    execSQL("CREATE TEMP TABLE IF NOT EXISTS capsule_rowid (x)")
    compileStatement("INSERT INTO temp.capsule_rowid (rowid) VALUES (?)").use {
        it.bindLong(1, rowid)
        it.executeInsert()
    }
    execSQL("DELETE FROM temp.capsule_rowid")
}

private fun SQLiteProgram.bindAll(params: List<SqlValue>) = params.forEachIndexed { i, value ->
    val index = i + 1 // SQLite parameters are 1-based
    when (value) {
        SqlValue.Null -> bindNull(index)
        is SqlValue.Integer -> bindLong(index, value.value)
        is SqlValue.Real -> bindDouble(index, value.value)
        is SqlValue.Text -> bindString(index, value.value)
        is SqlValue.Blob -> bindBlob(index, value.bytes)
    }
}

private fun Cursor.readRows(): List<SqlRow> {
    val names = columnNames
    val rows = ArrayList<SqlRow>(count)
    while (moveToNext()) {
        rows += names.indices.associateTo(LinkedHashMap()) { i -> names[i] to valueAt(i) }
    }
    return rows
}

private fun Cursor.valueAt(i: Int): SqlValue = when (getType(i)) {
    Cursor.FIELD_TYPE_NULL -> SqlValue.Null
    Cursor.FIELD_TYPE_INTEGER -> SqlValue.Integer(getLong(i))
    Cursor.FIELD_TYPE_FLOAT -> SqlValue.Real(getDouble(i))
    Cursor.FIELD_TYPE_BLOB -> SqlValue.Blob(getBlob(i))
    else -> SqlValue.Text(getString(i))
}
