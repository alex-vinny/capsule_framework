//
//  Fakes.swift
//  CapsuleTests
//
//  One fake per production interface — mirrors dev.capsule.fakes (Android).
//

import Foundation
@testable import Capsule

// MARK: - Clock

/// Test clock whose time is set explicitly.
public final class FakeClock: Clock {
    public private(set) var nowMs: Int64

    public init(nowMs: Int64 = 0) {
        self.nowMs = nowMs
    }

    public func now() -> Int64 { nowMs }

    @discardableResult
    public func advance(_ ms: Int64) -> Int64 {
        nowMs += ms
        return nowMs
    }
}

// MARK: - CrashLog

/// In-memory CrashLog for unit tests.
public final class FakeCrashLog: CrashLog {
    private var entries: [Int64]
    public private(set) var clearCount = 0

    public init(initial: [Int64] = []) {
        entries = initial
    }

    public func record(timestampMs: Int64) {
        entries.append(timestampMs)
    }

    public func timestamps() -> [Int64] { entries }

    public func clear() {
        clearCount += 1
        entries.removeAll()
    }
}

// MARK: - BundleStore

/// In-memory BundleStore for unit tests. Tracks calls and lets a test decide whether a
/// previous bundle is available for rollback.
public final class FakeBundleStore: BundleStore {
    public private(set) var installCount = 0
    public private(set) var rollbackCount = 0
    public private(set) var installed: [URL] = []
    private var hasPreviousFlag: Bool

    public init(hasPrevious: Bool = false) {
        hasPreviousFlag = hasPrevious
    }

    public func activeDir() -> URL? { nil }

    public func install(staged: URL) throws {
        installCount += 1
        installed.append(staged)
    }

    public func hasPrevious() -> Bool { hasPreviousFlag }

    public func rollback() -> Bool {
        guard hasPreviousFlag else { return false }
        rollbackCount += 1
        hasPreviousFlag = false  // single previous slot, consumed by rollback
        return true
    }

    public func setHasPrevious(_ value: Bool) {
        hasPreviousFlag = value
    }
}

// MARK: - CodeSyncHTTPClient

/// Scriptable in-memory CodeSyncHTTPClient. Tests queue responses per URL and inspect
/// the requests that were made — no sockets involved.
public final class FakeCodeSyncHTTPClient: CodeSyncHTTPClient {
    public struct RecordedRequest {
        public let url: String
        public let method: String
        public let body: Data?
    }

    public private(set) var requests: [RecordedRequest] = []
    private var responses: [String: [HTTPResponse]] = [:]
    private var failures: [String: Error] = [:]

    public init() {}

    public func enqueue(url: String, code: Int, body: Data) {
        responses[url, default: []].append(HTTPResponse(code: code, body: body))
    }

    public func enqueueJSON(url: String, code: Int, body: String) {
        enqueue(url: url, code: code, body: Data(body.utf8))
    }

    public func failWith(url: String, error: Error) {
        failures[url] = error
    }

    /// Rotates the LAST enqueued response for `url` to the front of its queue, so a test
    /// can consume a sabotaged response before the fixture's good one (queues are FIFO).
    public func rotateCheckToFirst(_ url: String) {
        guard var queue = responses[url], let last = queue.popLast() else {
            fatalError("no responses queued for \(url)")
        }
        queue.insert(last, at: 0)
        responses[url] = queue
    }

    public func get(_ url: String) async throws -> HTTPResponse {
        requests.append(RecordedRequest(url: url, method: "GET", body: nil))
        if let failure = failures[url] { throw failure }
        guard let next = responses[url]?.first else {
            fatalError("no scripted response for \(url)")
        }
        responses[url]?.removeFirst()
        return next
    }

    public func postJSON(_ url: String, jsonBody: Data) async throws -> HTTPResponse {
        requests.append(RecordedRequest(url: url, method: "POST", body: jsonBody))
        if let failure = failures[url] { throw failure }
        guard let next = responses[url]?.first else {
            fatalError("no scripted response for \(url)")
        }
        responses[url]?.removeFirst()
        return next
    }
}

// MARK: - CodeSyncPreferences

/// In-memory CodeSyncPreferences for unit tests — records writes for assertion.
public final class FakeCodeSyncPreferences: CodeSyncPreferences {
    public let deviceIdValue: String
    private var buildNumber: Int64
    private var bundleIdValue: String?
    private var bundlePathValue: String?

    public private(set) var setCurrentBundleCount = 0

    public init(
        deviceId: String = "3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d",
        initialBuildNumber: Int64 = -1
    ) {
        deviceIdValue = deviceId
        buildNumber = initialBuildNumber
    }

    public func deviceId() -> String { deviceIdValue }

    public func currentBuildNumber() -> Int64 { buildNumber }

    public func setCurrentBundle(buildNumber: Int64, bundleId: String, bundlePath: String) {
        setCurrentBundleCount += 1
        self.buildNumber = buildNumber
        self.bundleIdValue = bundleId
        self.bundlePathValue = bundlePath
    }

    public func currentBundleId() -> String? { bundleIdValue }

    public func currentBundlePath() -> String? { bundlePathValue }
}

// MARK: - Bridging

/// In-memory Bridging for unit tests — records sends.
public final class FakeBridge: Bridging {
    public private(set) var sent: [(method: String, args: Any?)] = []

    public init() {}

    public func send(_ method: String, args: Any?) {
        sent.append((method, args))
    }
}

// MARK: - StaticAssets

/// Map-backed StaticAssets that writes each file to a temp directory on demand and records
/// every path it was asked for.
public final class FakeStaticAssets: StaticAssets {
    public private(set) var requested: [String] = []
    private let files: [String: Data]
    private let root: URL

    public init(_ files: [String: Data]) {
        self.files = files
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("static-assets-\(UUID().uuidString)", isDirectory: true)
    }

    public convenience init(text files: [String: String]) {
        self.init(files.mapValues { Data($0.utf8) })
    }

    deinit {
        try? FileManager.default.removeItem(at: root)
    }

    public func url(for path: String) -> URL? {
        requested.append(path)
        guard let data = files[path] else { return nil }
        let url = root.appendingPathComponent(path)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url)
        return url
    }
}

// MARK: - AiProvider

/// Scripted AiProvider: a fixed availability and a scripted reply, streamed as `chunks`.
/// Records every request so tests can assert what reached the model.
public final class FakeAiProvider: AiProvider {
    public var current: AiAvailability
    public var chunks: [String]
    public var finishReason: AiFinishReason
    /// What `availability()` becomes once `prepare()` runs (nil = unchanged).
    public var afterPrepare: AiAvailability?
    public private(set) var requests: [AiRequest] = []
    public private(set) var prepareCalls = 0

    public init(
        _ availability: AiAvailability = AiAvailability(tier: .osNative, status: .ready),
        chunks: [String] = ["Hello", ", ", "world"],
        finishReason: AiFinishReason = .stop,
        afterPrepare: AiAvailability? = nil
    ) {
        current = availability
        self.chunks = chunks
        self.finishReason = finishReason
        self.afterPrepare = afterPrepare
    }

    public func availability() async -> AiAvailability { current }

    public func prepare() async -> AiAvailability {
        prepareCalls += 1
        if let afterPrepare { current = afterPrepare }
        return current
    }

    public func generate(_ request: AiRequest) async throws -> AiResult {
        try requireReady()
        requests.append(request)
        return AiResult(text: chunks.joined(), finishReason: finishReason)
    }

    public func stream(_ request: AiRequest, onChunk: @escaping (String) -> Void) async throws -> AiResult {
        try requireReady()
        requests.append(request)
        chunks.forEach(onChunk)
        return AiResult(text: chunks.joined(), finishReason: finishReason)
    }

    private func requireReady() throws {
        guard current.status == .ready else { throw AiError.unavailable(reason: current.reason) }
    }
}

// MARK: - DbProvider

/// Records every call; answers `sql` with `result`, or throws `failure` when set.
public final class FakeDbProvider: DbProvider {
    public var result: SqlResult = .run(rowsAffected: 0, insertId: nil)
    public var failure: DbError?
    public private(set) var statements: [SqlStatement] = []
    public private(set) var calls: [String] = []

    public init() {}

    public func sql(_ statement: SqlStatement) throws -> SqlResult {
        calls.append("sql")
        statements.append(statement)
        if let failure { throw failure }
        return result
    }

    public func begin() throws { calls.append("begin") }

    public func commit() throws { calls.append("commit") }

    public func rollback() throws { calls.append("rollback") }
}
