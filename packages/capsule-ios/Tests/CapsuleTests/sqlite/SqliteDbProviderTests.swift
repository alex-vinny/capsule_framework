// Docs: docs/guide/database.md
//
//  SqliteDbProviderTests.swift
//  CapsuleTests
//
//  SqliteDbProvider against the real system SQLite — the iOS twin of Android's instrumented
//  AndroidDbProviderTest. Apple platforms only (Linux has no SQLite3 module); runs on macOS CI.
//

#if canImport(SQLite3)
import XCTest
@testable import Capsule

final class SqliteDbProviderTests: XCTestCase {

    private var url: URL!
    private var db: SqliteDbProvider!

    override func setUpWithError() throws {
        url = FileManager.default.temporaryDirectory
            .appendingPathComponent("db-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("test.db")
        db = SqliteDbProvider(url: url)
        _ = try db.sql(SqlStatement(sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER, r REAL, s TEXT, b BLOB)"))
    }

    override func tearDownWithError() throws {
        db = nil
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }

    @discardableResult
    private func insert(_ n: SqlValue, _ r: SqlValue = .null, _ s: SqlValue = .null, _ b: SqlValue = .null) throws -> SqlResult {
        try db.sql(SqlStatement(sql: "INSERT INTO t (n, r, s, b) VALUES (?, ?, ?, ?)", params: [n, r, s, b]))
    }

    private func rows(_ sql: String, _ params: [SqlValue] = []) throws -> [SqlRow] {
        guard case .rows(let rows) = try db.sql(SqlStatement(sql: sql, params: params)) else {
            XCTFail("expected rows")
            return []
        }
        return rows
    }

    func testDdlChangesNoRowsAndInsertsReportTheirRowid() throws {
        XCTAssertEqual(try db.sql(SqlStatement(sql: "CREATE TABLE other (x)")), .run(rowsAffected: 0, insertId: nil))
        XCTAssertEqual(try insert(.integer(1)), .run(rowsAffected: 1, insertId: 1))
        XCTAssertEqual(try insert(.integer(2)), .run(rowsAffected: 1, insertId: 2))
    }

    func testAnInsertRepeatingThePreviousRowidStillReportsIt() throws {
        try insert(.integer(1)) // t's rowid 1
        _ = try db.sql(SqlStatement(sql: "CREATE TABLE u (x)"))
        XCTAssertEqual(try db.sql(SqlStatement(sql: "INSERT INTO u VALUES (1)")), .run(rowsAffected: 1, insertId: 1))
        // …and a statement that inserts nothing leaves last_insert_rowid() where it was.
        XCTAssertEqual(try db.sql(SqlStatement(sql: "UPDATE u SET x = 2")), .run(rowsAffected: 1, insertId: nil))
        XCTAssertEqual(try rows("SELECT last_insert_rowid() AS id"), [["id": .integer(1)]])
    }

    func testEveryStorageClassRoundTripsWithItsType() throws {
        try insert(.integer(.max), .real(2.5), .text("héllo"), .blob(Data([0, 1, 255])))
        try insert(.null)

        XCTAssertEqual(try rows("SELECT n, r, s, b FROM t ORDER BY id"), [
            ["n": .integer(.max), "r": .real(2.5), "s": .text("héllo"), "b": .blob(Data([0, 1, 255]))],
            ["n": .null, "r": .null, "s": .null, "b": .null],
        ])
    }

    func testParamsBindWithTheirType() throws {
        try insert(.integer(10))
        try insert(.integer(9))

        XCTAssertEqual(try rows("SELECT n FROM t WHERE n > ?", [.integer(9)]), [["n": .integer(10)]])
        XCTAssertEqual(try rows("SELECT ? + 1 AS x", [.integer(2)]), [["x": .integer(3)]])
    }

    func testUpdatesReportRowsAffected() throws {
        for _ in 0..<3 { try insert(.integer(1)) }

        let result = try db.sql(SqlStatement(sql: "UPDATE t SET n = ? WHERE n = ?", params: [.integer(2), .integer(1)]))

        XCTAssertEqual(result, .run(rowsAffected: 3, insertId: nil))
    }

    func testPragmasWorkBothWays() throws {
        _ = try db.sql(SqlStatement(sql: "PRAGMA user_version = 3"))
        XCTAssertEqual(try rows("PRAGMA user_version"), [["user_version": .integer(3)]])
    }

    func testCommittedAndRolledBackTransactions() throws {
        try db.begin()
        try insert(.integer(1))
        try db.commit()

        try db.begin()
        try insert(.integer(2))
        try db.rollback()

        XCTAssertEqual(try rows("SELECT n FROM t"), [["n": .integer(1)]])
    }

    func testBeginRollsBackATransactionLeftOpen() throws {
        try db.begin()
        try insert(.integer(1)) // the JS context "dies" here
        try db.begin()
        try db.commit()

        XCTAssertEqual(try rows("SELECT * FROM t"), [])
    }

    func testCommitWithoutATransactionIsASqlError() {
        XCTAssertThrowsError(try db.commit()) { XCTAssertEqual($0 as? DbError, .sql("No transaction is open")) }
    }

    func testSqliteErrorsCarryTheEngineMessage() {
        XCTAssertThrowsError(try db.sql(SqlStatement(sql: "SELECT * FROM missing"))) { error in
            guard case .sql(let message)? = error as? DbError else { return XCTFail("expected DbError.sql") }
            XCTAssertTrue(message.contains("no such table"))
        }
    }

    func testMoreParamsThanPlaceholdersIsASqlError() {
        XCTAssertThrowsError(try db.sql(SqlStatement(sql: "SELECT ?", params: [.integer(1), .integer(2)])))
    }
}
#endif
