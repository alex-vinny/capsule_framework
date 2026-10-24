// Docs: docs/guide/database.md
//
//  DbProvider.swift
//  Capsule iOS
//
//  Platform-neutral SQLite database — the native half of `@capsule/core`'s `db` API. Mirrors
//  Android's `DbProvider` (dev.capsule.db): one database per app, one connection, statements run
//  strictly one at a time. Transactions span several bridge calls (begin … sql … commit); the JS
//  side guarantees only one runs at a time, so the provider needs no transaction ids.
//
//  OTA-safety: the database file lives outside the OTA-swappable bundle dirs.
//

import Foundation

public protocol DbProvider: AnyObject {
    /// Runs one statement: `.rows` when it returns columns, else `.run`.
    func sql(_ statement: SqlStatement) throws -> SqlResult
    /// Opens a transaction, first rolling back one left open by a JS context that died mid-way.
    func begin() throws
    /// Commits the open transaction; fails if none is open.
    func commit() throws
    /// Rolls back the open transaction; a no-op if none is open.
    func rollback() throws
}

/// SQLite's five storage classes.
public enum SqlValue: Equatable {
    case null
    case integer(Int64)
    case real(Double)
    case text(String)
    case blob(Data)
}

/// One SQL statement and its positional (`?`) parameters.
public struct SqlStatement: Equatable {
    public let sql: String
    public let params: [SqlValue]

    public init(sql: String, params: [SqlValue] = []) {
        self.sql = sql
        self.params = params
    }
}

/// A result row: column name → value.
public typealias SqlRow = [String: SqlValue]

public enum SqlResult: Equatable {
    case rows([SqlRow])
    /// `rowsAffected`: rows inserted, updated or deleted (including by triggers); 0 for DDL.
    /// `insertId`: rowid of the last row this statement inserted, or nil if it inserted none.
    case run(rowsAffected: Int64, insertId: Int64?)
}

/// Every SQLite failure — maps to the bridge's `SQL_ERROR` (8001).
public enum DbError: Error, Equatable {
    case sql(String)
}
