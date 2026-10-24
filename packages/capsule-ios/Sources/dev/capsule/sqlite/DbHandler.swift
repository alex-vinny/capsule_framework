// Docs: docs/guide/database.md
//
//  DbHandler.swift
//  Capsule iOS
//
//  The `db.*` bridge methods: JSON params in, JSON result out, over an injected `DbProvider`.
//  Mirrors Android's DbHandlers.kt and its wire format (and @capsule/core db.ts):
//  params are JSON null / number / string, or {"$blob": "<base64>"}; results are
//  {"rows": [...]} for statements that return columns, else {"rowsAffected", "insertId"?}.
//
//  iOS has no handler registry yet (CapsuleBridge is a Phase-4 placeholder); the bridge will
//  route `db.*` calls here.
//

import Foundation

public final class DbHandler {
    public enum Method {
        public static let sql = "db.sql"
        public static let begin = "db.begin"
        public static let commit = "db.commit"
        public static let rollback = "db.rollback"
        public static let all = [sql, begin, commit, rollback]
    }

    /// Capability name + native version for OTA gating (same as Android's DbProvider).
    public static let capability = "db"
    public static let capabilityVersion = 1

    private let provider: DbProvider

    public init(provider: DbProvider) {
        self.provider = provider
    }

    /// Handles one `db.*` call. Throws `DbError` (→ `SQL_ERROR`) for bad params and SQLite failures.
    public func handle(method: String, params: Data) throws -> Data {
        switch method {
        case Method.sql:
            return try encode(provider.sql(try statement(from: params)))
        case Method.begin:
            try provider.begin()
        case Method.commit:
            try provider.commit()
        case Method.rollback:
            try provider.rollback()
        default:
            throw DbError.sql("Unknown method \(method)")
        }
        return Data("{}".utf8)
    }

    // MARK: - Wire mapping

    private struct SqlParams: Decodable {
        let sql: String?
        let params: [WireValue]?
    }

    private func statement(from params: Data) throws -> SqlStatement {
        let decoded: SqlParams
        do {
            decoded = try JSONDecoder().decode(SqlParams.self, from: params)
        } catch let error as WireValue.Unsupported {
            throw DbError.sql("Parameter \(error.position): unsupported value type")
        } catch {
            throw DbError.sql("Invalid db.sql params")
        }
        guard let sql = decoded.sql, !sql.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DbError.sql("sql required")
        }
        return SqlStatement(sql: sql, params: (decoded.params ?? []).map(\.value))
    }

    private func encode(_ result: SqlResult) throws -> Data {
        let json: [String: Any]
        switch result {
        case .rows(let rows):
            json = ["rows": rows.map { $0.mapValues(Self.json) }]
        case .run(let rowsAffected, let insertId):
            json = insertId.map { ["rowsAffected": rowsAffected, "insertId": $0] } ?? ["rowsAffected": rowsAffected]
        }
        return try JSONSerialization.data(withJSONObject: json)
    }

    private static func json(_ value: SqlValue) -> Any {
        switch value {
        case .null: return NSNull()
        case .integer(let n): return n
        case .real(let x): return x
        case .text(let s): return s
        case .blob(let data): return ["$blob": data.base64EncodedString()]
        }
    }
}

/// A bound parameter as it arrives over the bridge.
private struct WireValue: Decodable {
    let value: SqlValue

    struct Unsupported: Error {
        let position: Int
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        // Bool before the numbers: JSON true must not decode as 1.0, and 1 must not decode as true.
        if container.decodeNil() {
            value = .null
        } else if let flag = try? container.decode(Bool.self) {
            value = .integer(flag ? 1 : 0)
        } else if let n = try? container.decode(Int64.self) {
            value = .integer(n)
        } else if let x = try? container.decode(Double.self) {
            value = .real(x)
        } else if let s = try? container.decode(String.self) {
            value = .text(s)
        } else if let blob = try? container.decode([String: String].self),
                  let base64 = blob["$blob"], let data = Data(base64Encoded: base64) {
            value = .blob(data)
        } else {
            // codingPath ends with the array index of this parameter.
            throw Unsupported(position: (decoder.codingPath.last?.intValue ?? 0) + 1)
        }
    }
}
