// Docs: docs/guide/database.md
//
//  SqliteDbProvider.swift
//  Capsule iOS
//
//  `DbProvider` over the system SQLite3 library (Apple platforms only — Linux has no SQLite3
//  module, so this compiles out there and the Linux suite tests DbHandler with a fake).
//

#if canImport(SQLite3)
import Foundation
import SQLite3

public final class SqliteDbProvider: DbProvider {
    private let url: URL
    private let lock = NSLock()
    private var connection: OpaquePointer?

    /// "Nothing inserted" for last_insert_rowid; a real rowid only if inserted explicitly.
    private static let noRowid = Int64.min

    public init(url: URL) {
        self.url = url
    }

    /// `Application Support/Capsule/capsule.db` — outside the OTA bundle store.
    public static func appDefault() throws -> SqliteDbProvider {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        return SqliteDbProvider(url: support.appendingPathComponent("Capsule/capsule.db"))
    }

    deinit {
        sqlite3_close(connection)
    }

    // MARK: - DbProvider

    public func sql(_ statement: SqlStatement) throws -> SqlResult {
        try locked { db in
            var prepared: OpaquePointer?
            guard sqlite3_prepare_v2(db, statement.sql, -1, &prepared, nil) == SQLITE_OK else {
                throw error(db)
            }
            guard let stmt = prepared else { throw DbError.sql("No SQL statement to run") }
            defer { sqlite3_finalize(stmt) }
            try bind(statement.params, to: stmt, db)

            let columns = Int(sqlite3_column_count(stmt))
            if columns > 0 { return .rows(try readRows(stmt, columns: columns, db)) }

            // Comparing last_insert_rowid before and after can't tell an insert that repeats the
            // previous rowid (another table's row 1) from no insert, so it is set to a value no
            // insert produces, and put back when none happened.
            let idBefore = sqlite3_last_insert_rowid(db)
            sqlite3_set_last_insert_rowid(db, Self.noRowid)
            defer {
                if sqlite3_last_insert_rowid(db) == Self.noRowid { sqlite3_set_last_insert_rowid(db, idBefore) }
            }
            let changesBefore = sqlite3_total_changes(db)
            guard sqlite3_step(stmt) == SQLITE_DONE else { throw error(db) }
            let idAfter = sqlite3_last_insert_rowid(db)
            return .run(
                rowsAffected: Int64(sqlite3_total_changes(db) - changesBefore),
                insertId: idAfter != Self.noRowid ? idAfter : nil
            )
        }
    }

    public func begin() throws {
        try locked { db in
            if sqlite3_get_autocommit(db) == 0 { try exec("ROLLBACK", db) }
            try exec("BEGIN IMMEDIATE", db)
        }
    }

    public func commit() throws {
        try locked { db in
            guard sqlite3_get_autocommit(db) == 0 else { throw DbError.sql("No transaction is open") }
            try exec("COMMIT", db)
        }
    }

    public func rollback() throws {
        try locked { db in
            if sqlite3_get_autocommit(db) == 0 { try exec("ROLLBACK", db) }
        }
    }

    // MARK: - Connection

    private func locked<T>(_ body: (OpaquePointer) throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body(try open())
    }

    private func open() throws -> OpaquePointer {
        if let connection { return connection }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
        } catch {
            throw DbError.sql("Cannot create the database directory: \(error)")
        }
        var db: OpaquePointer?
        guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nil) == SQLITE_OK,
              let db
        else {
            let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Cannot open the database"
            sqlite3_close(db)
            throw DbError.sql(message)
        }
        connection = db
        return db
    }

    // MARK: - Statements

    /// SQLite copies bound text/blobs when given this destructor (the C macro is not imported).
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private func bind(_ params: [SqlValue], to stmt: OpaquePointer, _ db: OpaquePointer) throws {
        for (offset, value) in params.enumerated() {
            let index = Int32(offset + 1) // SQLite parameters are 1-based
            let rc: Int32
            switch value {
            case .null:
                rc = sqlite3_bind_null(stmt, index)
            case .integer(let n):
                rc = sqlite3_bind_int64(stmt, index, n)
            case .real(let x):
                rc = sqlite3_bind_double(stmt, index, x)
            case .text(let s):
                rc = sqlite3_bind_text(stmt, index, s, -1, SqliteDbProvider.transient)
            case .blob(let data) where data.isEmpty:
                rc = sqlite3_bind_zeroblob(stmt, index, 0) // a nil pointer would bind NULL
            case .blob(let data):
                rc = data.withUnsafeBytes {
                    sqlite3_bind_blob(stmt, index, $0.baseAddress, Int32($0.count), SqliteDbProvider.transient)
                }
            }
            guard rc == SQLITE_OK else { throw error(db) }
        }
    }

    private func readRows(_ stmt: OpaquePointer, columns: Int, _ db: OpaquePointer) throws -> [SqlRow] {
        let names = (0..<columns).map { String(cString: sqlite3_column_name(stmt, Int32($0))) }
        var rows: [SqlRow] = []
        while true {
            let rc = sqlite3_step(stmt)
            if rc == SQLITE_DONE { return rows }
            guard rc == SQLITE_ROW else { throw error(db) }
            var row: SqlRow = [:]
            for (i, name) in names.enumerated() {
                row[name] = value(stmt, Int32(i))
            }
            rows.append(row)
        }
    }

    private func value(_ stmt: OpaquePointer, _ column: Int32) -> SqlValue {
        switch sqlite3_column_type(stmt, column) {
        case SQLITE_INTEGER:
            return .integer(sqlite3_column_int64(stmt, column))
        case SQLITE_FLOAT:
            return .real(sqlite3_column_double(stmt, column))
        case SQLITE_BLOB:
            let count = Int(sqlite3_column_bytes(stmt, column))
            guard count > 0, let bytes = sqlite3_column_blob(stmt, column) else { return .blob(Data()) }
            return .blob(Data(bytes: bytes, count: count))
        case SQLITE_NULL:
            return .null
        default:
            return .text(String(cString: sqlite3_column_text(stmt, column)))
        }
    }

    private func exec(_ sql: String, _ db: OpaquePointer) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw error(db) }
    }

    private func error(_ db: OpaquePointer) -> DbError {
        .sql(String(cString: sqlite3_errmsg(db)))
    }
}
#endif
