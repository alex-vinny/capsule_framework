// Docs: docs/guide/database.md
package dev.capsule.db

/**
 * Platform-neutral SQLite database — the native half of `@capsule/core`'s `db` API. The Android
 * implementation is [AndroidDbProvider]; iOS sits behind the same contract (`DbProvider.swift`).
 *
 * One database per app, one connection, statements run strictly one at a time. Transactions span
 * several bridge calls ([begin] … [sql] … [commit]); the JS side guarantees only one runs at a
 * time, so the provider needs no transaction ids.
 *
 * **OTA-safety (Phase-3 constraint):** the database file lives *outside* the OTA-swappable bundle
 * dirs, so a code-push bundle swap never touches user data.
 *
 * Implementations signal every SQLite failure as `CapsuleException(BridgeError.SqlError)`.
 */
interface DbProvider {
    /** Runs one statement: [SqlResult.Rows] when it returns columns, else [SqlResult.Run]. */
    suspend fun sql(statement: SqlStatement): SqlResult

    /** Opens a transaction, first rolling back one left open by a JS context that died mid-way. */
    suspend fun begin()

    /** Commits the open transaction; fails if none is open. */
    suspend fun commit()

    /** Rolls back the open transaction; a no-op if none is open. */
    suspend fun rollback()

    companion object {
        /** Capability name + native version for OTA gating (see CapabilityRegistry). */
        const val CAPABILITY = "db"
        const val CAPABILITY_VERSION = 1
    }
}

/** One SQL statement and its positional (`?`) parameters. */
data class SqlStatement(val sql: String, val params: List<SqlValue> = emptyList())

/** SQLite's five storage classes. */
sealed interface SqlValue {
    object Null : SqlValue
    data class Integer(val value: Long) : SqlValue
    data class Real(val value: Double) : SqlValue
    data class Text(val value: String) : SqlValue

    class Blob(val bytes: ByteArray) : SqlValue {
        override fun equals(other: Any?) = other is Blob && bytes.contentEquals(other.bytes)
        override fun hashCode() = bytes.contentHashCode()
        override fun toString() = "Blob(${bytes.size} bytes)"
    }
}

/** A result row: column name → value, in column order. */
typealias SqlRow = Map<String, SqlValue>

sealed interface SqlResult {
    data class Rows(val rows: List<SqlRow>) : SqlResult

    /**
     * @param rowsAffected rows inserted, updated or deleted (including by triggers); 0 for DDL.
     * @param insertId rowid of the last row this statement inserted, or null if it inserted none.
     */
    data class Run(val rowsAffected: Long, val insertId: Long?) : SqlResult
}
