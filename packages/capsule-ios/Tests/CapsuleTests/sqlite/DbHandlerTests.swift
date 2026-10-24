// Docs: docs/guide/database.md
//
//  DbHandlerTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.handlers.db.DbHandlerTest (Android) — the db.* wire mapping over a fake
//  provider. Runs on Linux too.
//

import XCTest
@testable import Capsule

final class DbHandlerTests: XCTestCase {

    private var fake: FakeDbProvider!
    private var handler: DbHandler!

    override func setUp() {
        fake = FakeDbProvider()
        handler = DbHandler(provider: fake)
    }

    private func call(_ method: String, _ json: String = "{}") throws -> Any {
        let data = try handler.handle(method: method, params: Data(json.utf8))
        return try JSONSerialization.jsonObject(with: data)
    }

    private func expectSqlError(_ message: String, _ body: () throws -> Void) {
        XCTAssertThrowsError(try body()) { error in
            XCTAssertEqual(error as? DbError, .sql(message))
        }
    }

    // MARK: - db.sql: params in

    func testSqlForwardsTheStatementWithTypedParams() throws {
        _ = try call(DbHandler.Method.sql, #"{"sql":"INSERT INTO t VALUES (?,?,?,?,?,?)","params":[null,42,1.5,"ü",true,{"$blob":"AQID"}]}"#)

        XCTAssertEqual(fake.statements, [SqlStatement(
            sql: "INSERT INTO t VALUES (?,?,?,?,?,?)",
            params: [.null, .integer(42), .real(1.5), .text("ü"), .integer(1), .blob(Data([1, 2, 3]))]
        )])
    }

    func testSqlWithoutParamsForwardsAnEmptyList() throws {
        _ = try call(DbHandler.Method.sql, #"{"sql":"SELECT 1"}"#)

        XCTAssertEqual(fake.statements, [SqlStatement(sql: "SELECT 1")])
    }

    func testMissingSqlIsASqlError() {
        expectSqlError("sql required") { _ = try call(DbHandler.Method.sql) }
    }

    func testUnsupportedParamTypesAreASqlErrorNamingThePosition() {
        expectSqlError("Parameter 2: unsupported value type") {
            _ = try call(DbHandler.Method.sql, #"{"sql":"SELECT ?, ?","params":[1,[]]}"#)
        }
        expectSqlError("Parameter 1: unsupported value type") {
            _ = try call(DbHandler.Method.sql, #"{"sql":"SELECT ?","params":[{"x":1}]}"#)
        }
    }

    // MARK: - db.sql: results out

    func testRowsComeBackAsObjectsWithTypedValuesAndBase64Blobs() throws {
        fake.result = .rows([[
            "id": .integer(7), "score": .real(2.5), "name": .text("a"), "note": .null, "data": .blob(Data([1, 2, 3])),
        ]])

        let json = try call(DbHandler.Method.sql, #"{"sql":"SELECT * FROM t"}"#) as? [String: Any]
        let row = (json?["rows"] as? [[String: Any]])?.first

        XCTAssertEqual(row?["id"] as? Int, 7)
        XCTAssertEqual(row?["score"] as? Double, 2.5)
        XCTAssertEqual(row?["name"] as? String, "a")
        XCTAssertTrue(row?["note"] is NSNull)
        XCTAssertEqual(row?["data"] as? [String: String], ["$blob": "AQID"])
    }

    func testAWriteReturnsRowsAffectedAndInsertIdOnlyWhenARowWasInserted() throws {
        fake.result = .run(rowsAffected: 1, insertId: 9)
        let insert = try call(DbHandler.Method.sql, #"{"sql":"INSERT INTO t DEFAULT VALUES"}"#) as? [String: Int]
        XCTAssertEqual(insert, ["rowsAffected": 1, "insertId": 9])

        fake.result = .run(rowsAffected: 3, insertId: nil)
        let update = try call(DbHandler.Method.sql, #"{"sql":"UPDATE t SET x = 1"}"#) as? [String: Int]
        XCTAssertEqual(update, ["rowsAffected": 3])
    }

    func testProviderErrorsPropagateUnchanged() {
        fake.failure = .sql("no such table: t")

        expectSqlError("no such table: t") { _ = try call(DbHandler.Method.sql, #"{"sql":"SELECT * FROM t"}"#) }
    }

    // MARK: - transactions

    func testBeginCommitAndRollbackReachTheProviderInOrder() throws {
        _ = try call(DbHandler.Method.begin)
        _ = try call(DbHandler.Method.sql, #"{"sql":"DELETE FROM t"}"#)
        _ = try call(DbHandler.Method.commit)
        _ = try call(DbHandler.Method.rollback)

        XCTAssertEqual(fake.calls, ["begin", "sql", "commit", "rollback"])
    }

    func testUnknownMethodsAreRejected() {
        expectSqlError("Unknown method db.nope") { _ = try call("db.nope") }
    }
}
