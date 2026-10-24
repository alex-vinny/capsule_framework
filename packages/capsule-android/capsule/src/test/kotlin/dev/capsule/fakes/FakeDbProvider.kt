package dev.capsule.fakes

import dev.capsule.db.DbProvider
import dev.capsule.db.SqlResult
import dev.capsule.db.SqlStatement
import dev.capsule.handlers.CapsuleException

/** Records every call; answers [sql] with [result], or throws [failure] when set. */
class FakeDbProvider(
    var result: SqlResult = SqlResult.Run(rowsAffected = 0, insertId = null),
    var failure: CapsuleException? = null,
) : DbProvider {
    val statements = mutableListOf<SqlStatement>()
    val calls = mutableListOf<String>()

    override suspend fun sql(statement: SqlStatement): SqlResult {
        calls += "sql"
        statements += statement
        failure?.let { throw it }
        return result
    }

    override suspend fun begin() { calls += "begin" }

    override suspend fun commit() { calls += "commit" }

    override suspend fun rollback() { calls += "rollback" }
}
