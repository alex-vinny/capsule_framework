// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncManagerTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.codesync.CodeSyncManagerTest (Android) — full-flow tests:
//  check -> rollout -> download -> verify -> extract -> install -> bookkeeping —
//  all over fakes, no sockets, no iOS runtime. Runs on Linux too.
//

import XCTest
import Crypto
import ZIPFoundation
@testable import Capsule

final class CodeSyncManagerTests: XCTestCase {

    private let appId = "com.example.app"
    private let deviceId = "3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d"  // FakeCodeSyncPreferences default
    private var checkURLString: String { "https://sync.example.com/v1/check/\(appId)/production/1.4.0" }
    private var checkinURLString: String { "https://sync.example.com/v1/devices/checkin" }

    private var root: URL!
    private var transport: FakeCodeSyncHTTPClient!
    private var preferences: FakeCodeSyncPreferences!
    private var bundleStore: FakeBundleStore!
    private var bundlesRoot: URL!
    private var manager: CodeSyncManager!
    private var toCleanup: [URL] = []
    private var stagedCounter = 0

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("codesync-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        toCleanup.append(root)

        transport = FakeCodeSyncHTTPClient()
        preferences = FakeCodeSyncPreferences()
        bundleStore = FakeBundleStore()
        bundlesRoot = root.appendingPathComponent("bundles", isDirectory: true)
        manager = makeManager()
    }

    override func tearDownWithError() throws {
        for url in toCleanup { try? FileManager.default.removeItem(at: url) }
        toCleanup.removeAll()
    }

    private func makeManager(url: String = "https://sync.example.com") -> CodeSyncManager {
        CodeSyncManager(
            config: CodeSyncConfig(
                url: url, appId: appId, channel: "production", nativeVersion: "1.4.0"),
            httpClient: transport,
            preferences: preferences,
            bundleStore: bundleStore,
            bundlesRoot: bundlesRoot
        )
    }

    // MARK: - Fixtures

    /// Build a real bundle zip + its SHA-256 hex, and script the check + download + check-in responses.
    private func scriptUpdate(buildNumber: Int64 = 47, rolloutPercent: Int = 100) throws
        -> (zipURL: URL, sha256: String)
    {
        stagedCounter += 1
        let staged = root.appendingPathComponent(
            "staged-\(buildNumber)-\(stagedCounter)", isDirectory: true)
        try FileManager.default.createDirectory(
            at: staged.appendingPathComponent("www", isDirectory: true),
            withIntermediateDirectories: true)
        try "<!-- build \(buildNumber) -->".write(
            to: staged.appendingPathComponent("www/index.html"), atomically: true, encoding: .utf8)
        try FileManager.default.createDirectory(
            at: staged.appendingPathComponent("server", isDirectory: true),
            withIntermediateDirectories: true)
        try "/* \(buildNumber) */".write(
            to: staged.appendingPathComponent("server/bundle.js"), atomically: true, encoding: .utf8)

        let zipURL = root.appendingPathComponent("bundle-\(buildNumber)-\(stagedCounter).zip")
        let archive = try Archive(url: zipURL, accessMode: .create)
        try archive.addEntry(with: "www/index.html", relativeTo: staged)
        try archive.addEntry(with: "server/bundle.js", relativeTo: staged)

        let zipBytes = try Data(contentsOf: zipURL)
        let sha256 = SHA256.hash(data: zipBytes).map { String(format: "%02x", $0) }.joined()

        let bundleId = "bundle-\(buildNumber)"
        let downloadURL = "https://cdn.example.com/bundles/\(bundleId).zip"
        let checkBody = """
            {"latestBuildNumber":\(buildNumber),"bundle":{"id":"\(bundleId)","version":"1.4.2",
             "buildNumber":\(buildNumber),"rolloutPercent":\(rolloutPercent),"url":"\(downloadURL)",
             "hash":"sha256:\(sha256)","sizeBytes":\(zipBytes.count),"mandatory":false}}
            """
        transport.enqueueJSON(url: checkURLString, code: 200, body: checkBody)
        transport.enqueue(url: downloadURL, code: 200, body: zipBytes)
        transport.enqueueJSON(url: checkinURLString, code: 202, body: "{}")
        return (zipURL, sha256)
    }

    // MARK: - Happy path

    func testNewBundleInRolloutDownloadsVerifiesAndInstalls() async throws {
        _ = try scriptUpdate(buildNumber: 47)

        let result = await manager.checkForUpdate()

        guard case .updateReady(let path) = result else {
            return XCTFail("expected updateReady, got \(result)")
        }
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: URL(fileURLWithPath: path).appendingPathComponent("www/index.html").path))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: URL(fileURLWithPath: path).appendingPathComponent("server/bundle.js").path))
        XCTAssertEqual(bundleStore.installCount, 1)
        XCTAssertEqual(preferences.currentBuildNumber(), 47)
        XCTAssertEqual(preferences.currentBundleId(), "bundle-47")
        XCTAssertEqual(manager.lastStatus, CodeSyncStatus.downloadReady)
    }

    func testCheckAndDownloadRequestsHitTheDocumentedEndpoints() async throws {
        _ = try scriptUpdate()

        _ = await manager.checkForUpdate()

        let getURLs = transport.requests.filter { $0.method == "GET" }.map { $0.url }
        XCTAssertEqual(
            getURLs, [checkURLString, "https://cdn.example.com/bundles/bundle-47.zip"])
    }

    func testDeviceCheckInIsPostedFireAndForget() async throws {
        _ = try scriptUpdate()

        _ = await manager.checkForUpdate()

        let checkin = transport.requests.first { $0.method == "POST" }
        XCTAssertNotNil(checkin)
        XCTAssertEqual(checkin?.url, checkinURLString)
        let body = String(data: checkin!.body ?? Data(), encoding: .utf8) ?? ""
        XCTAssertTrue(body.contains("\"deviceId\":\"\(deviceId)\""))
        XCTAssertTrue(body.contains("\"platform\":\"ios\""))
    }

    // MARK: - Rollout / staleness gates

    func testRolloutPercent0LeavesTheDeviceUpToDateWithoutDownloading() async throws {
        _ = try scriptUpdate(rolloutPercent: 0)

        let result = await manager.checkForUpdate()

        XCTAssertEqual(result, .upToDate)
        // Only the check GET and the fire-and-forget check-in POST — never the bundle download.
        XCTAssertEqual(transport.requests.count, 2)
        XCTAssertTrue(transport.requests.allSatisfy { !$0.url.contains("/bundles/") })
        XCTAssertEqual(bundleStore.installCount, 0)
    }

    func testBuildNumberNotNewerThanInstalledIsUpToDate() async throws {
        preferences.setCurrentBundle(buildNumber: 47, bundleId: "old", bundlePath: "/old")
        _ = try scriptUpdate(buildNumber: 47)  // same build -> not newer

        let result = await manager.checkForUpdate()

        XCTAssertEqual(result, .upToDate)
        XCTAssertEqual(bundleStore.installCount, 0)
    }

    func testDeviceOutsideTheRolloutCohortIsUpToDate() async throws {
        // bucket(deviceId) = 64 -> excluded at 64, included at 65.
        _ = try scriptUpdate(rolloutPercent: 64)
        let excluded = await manager.checkForUpdate()
        XCTAssertEqual(excluded, .upToDate)

        _ = try scriptUpdate(rolloutPercent: 65)
        let included = await manager.checkForUpdate()
        guard case .updateReady = included else {
            return XCTFail("expected updateReady at 65, got \(included)")
        }
    }

    // MARK: - Failure paths

    func testHashMismatchRejectsTheBundleAndInstallsNothing() async throws {
        // The WRONG check response must be consumed on this run — scriptUpdate queues the
        // good one behind it (FIFO), so enqueue the sabotaged check then rotate it first.
        let (zipURL, realSha) = try scriptUpdate(buildNumber: 47)
        transport.enqueueJSON(
            url: checkURLString, code: 200,
            body: """
                {"latestBuildNumber":47,"bundle":{"id":"bundle-47","version":"1.4.2","buildNumber":47,
                 "rolloutPercent":100,"url":"https://cdn.example.com/bundles/bundle-47.zip",
                 "hash":"sha256:\(String(repeating: "0", count: 64))","sizeBytes":\(zipURL.fileSize ?? 0),"mandatory":false}}
                """)
        transport.rotateCheckToFirst(checkURLString)

        let result = await manager.checkForUpdate()

        guard case .error(let message) = result else {
            return XCTFail("expected error, got \(result)")
        }
        XCTAssertTrue(message.contains("Hash verification failed"))
        XCTAssertEqual(bundleStore.installCount, 0)
        XCTAssertEqual(preferences.currentBuildNumber(), -1)  // bookkeeping untouched
        XCTAssertEqual(manager.lastStatus, CodeSyncStatus.error)
        XCTAssertNotEqual(realSha, String(repeating: "0", count: 64))
    }

    func testNon200FromTheCheckEndpointIsAnError() async throws {
        transport.enqueueJSON(url: checkURLString, code: 404, body: "not found")

        let result = await manager.checkForUpdate()

        guard case .error(let message) = result else {
            return XCTFail("expected error, got \(result)")
        }
        XCTAssertTrue(message.contains("404"))
    }

    func testNetworkFailureIsAnErrorNotACrash() async throws {
        transport.failWith(url: checkURLString, error: URLError(.notConnectedToInternet))

        let result = await manager.checkForUpdate()

        guard case .error = result else {
            return XCTFail("expected error, got \(result)")
        }
    }

    func testGarbageCheckBodyIsAnError() async throws {
        transport.enqueueJSON(url: checkURLString, code: 200, body: "<html>gateway timeout</html>")

        let result = await manager.checkForUpdate()

        guard case .error(let message) = result else {
            return XCTFail("expected error, got \(result)")
        }
        XCTAssertTrue(message.contains("parse"))
    }

    func testDownloadFailureCleansTheStagingDirectory() async throws {
        let downloadURL = "https://cdn.example.com/bundles/bundle-47.zip"
        transport.enqueueJSON(
            url: checkURLString, code: 200,
            body: """
                {"latestBuildNumber":47,"bundle":{"id":"bundle-47","version":"1.4.2","buildNumber":47,
                 "rolloutPercent":100,"url":"\(downloadURL)","hash":"sha256:aa","sizeBytes":1,"mandatory":false}}
                """)
        transport.enqueueJSON(url: checkinURLString, code: 202, body: "{}")
        transport.failWith(url: downloadURL, error: URLError(.badServerResponse))

        let result = await manager.checkForUpdate()

        guard case .error = result else {
            return XCTFail("expected error, got \(result)")
        }
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: bundlesRoot.appendingPathComponent("bundle-47").path))  // staging cleaned
    }

    // MARK: - URL building

    func testCheckURLMatchesTheDocumentedShape() {
        XCTAssertEqual(manager.checkURL(), checkURLString)
    }

    func testTrailingSlashInConfigURLDoesNotDoubleUp() {
        let m = makeManager(url: "https://sync.example.com/")
        XCTAssertEqual(m.checkURL(), checkURLString)
    }
}

private extension URL {
    var fileSize: Int64? {
        let values = try? resourceValues(forKeys: [.fileSizeKey])
        return values.map { Int64($0.fileSize ?? 0) }
    }
}
