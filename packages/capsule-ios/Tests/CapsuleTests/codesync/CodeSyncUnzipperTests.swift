// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncUnzipperTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.codesync.CodeSyncUnzipperTest (Android) — round-trip +
//  zip-slip rejection, built with ZIPFoundation (same lib the production unzip uses).
//

import XCTest
import ZIPFoundation
@testable import Capsule

final class CodeSyncUnzipperTests: XCTestCase {

    private var root: URL!
    private var toCleanup: [URL] = []

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("unzip-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        toCleanup.append(root)
    }

    override func tearDownWithError() throws {
        for url in toCleanup { try? FileManager.default.removeItem(at: url) }
        toCleanup.removeAll()
    }

    /// Build a zip from (entryName -> content) pairs, staging real files under root so
    /// ZIPFoundation's relative-path API can read them.
    private func makeZip(named name: String, entries: [String: String]) throws -> URL {
        let zipURL = root.appendingPathComponent(name, isDirectory: false)
        let archive = try Archive(url: zipURL, accessMode: .create)
        for (entryName, content) in entries {
            // Stage the content file where `relativeTo + entryName` resolves.
            let resolved = URL(fileURLWithPath: entryName, relativeTo: root)
            try FileManager.default.createDirectory(
                at: resolved.deletingLastPathComponent(), withIntermediateDirectories: true)
            try content.write(to: resolved, atomically: true, encoding: .utf8)
            try archive.addEntry(with: entryName, relativeTo: root)
        }
        return zipURL
    }

    func testExtractsNestedBundleStructure() throws {
        let zipURL = try makeZip(
            named: "bundle.zip",
            entries: [
                "www/index.html": "<html></html>",
                "www/assets/main.js": "console.log(1)",
                "server/bundle.js": "/* routes */",
                "capsule-bundle.json": "{}",
            ])
        let target = root.appendingPathComponent("out", isDirectory: true)

        XCTAssertTrue(CodeSyncUnzipper.unzip(zipURL: zipURL, targetDir: target))

        XCTAssertEqual(
            try String(contentsOf: target.appendingPathComponent("www/index.html"), encoding: .utf8),
            "<html></html>")
        XCTAssertEqual(
            try String(contentsOf: target.appendingPathComponent("www/assets/main.js"), encoding: .utf8),
            "console.log(1)")
        XCTAssertEqual(
            try String(contentsOf: target.appendingPathComponent("server/bundle.js"), encoding: .utf8),
            "/* routes */")
        XCTAssertEqual(
            try String(contentsOf: target.appendingPathComponent("capsule-bundle.json"), encoding: .utf8),
            "{}")
    }

    func testReExtractionOverAnExistingDirectorySucceeds() throws {
        let zipURL = try makeZip(named: "bundle.zip", entries: ["www/index.html": "v1"])
        let target = root.appendingPathComponent("out", isDirectory: true)
        XCTAssertTrue(CodeSyncUnzipper.unzip(zipURL: zipURL, targetDir: target))

        let updated = try makeZip(named: "bundle2.zip", entries: ["www/index.html": "v2"])
        XCTAssertTrue(CodeSyncUnzipper.unzip(zipURL: updated, targetDir: target))
        XCTAssertEqual(
            try String(contentsOf: target.appendingPathComponent("www/index.html"), encoding: .utf8),
            "v2")
    }

    func testRejectsZipSlipEntriesEscapingTheTarget() throws {
        // "../evil.txt" relative to root resolves OUTSIDE root (parent dir), so addEntry
        // succeeds and the ARCHIVE carries the escaping name. The controlled file lives at
        // that resolved location; the security property is that the failed extraction
        // leaves it byte-for-byte untouched.
        let evilResolved = URL(fileURLWithPath: "../evil.txt", relativeTo: root)
        toCleanup.append(evilResolved)

        let zipURL = try makeZip(
            named: "evil.zip",
            entries: [
                "www/index.html": "<html></html>",
                "../evil.txt": "pwned",
            ])
        // Snapshot AFTER makeZip: the fixture's own staging step wrote "pwned" to the
        // controlled file; what must hold is that the (failing) extraction changes nothing.
        let before = try Data(contentsOf: evilResolved)
        let target = root.appendingPathComponent("out", isDirectory: true)

        XCTAssertFalse(CodeSyncUnzipper.unzip(zipURL: zipURL, targetDir: target))
        // The escape must not have been written by the unzipper: controlled file untouched.
        XCTAssertEqual(try Data(contentsOf: evilResolved), before)
    }

    func testMissingZipFileReturnsFalse() {
        let missing = root.appendingPathComponent("nope.zip", isDirectory: false)
        XCTAssertFalse(CodeSyncUnzipper.unzip(
            zipURL: missing, targetDir: root.appendingPathComponent("out", isDirectory: true)))
    }

    func testCorruptZipReturnsFalse() throws {
        let zipURL = root.appendingPathComponent("bad.zip", isDirectory: false)
        try "this is not a zip".write(to: zipURL, atomically: true, encoding: .utf8)

        XCTAssertFalse(CodeSyncUnzipper.unzip(
            zipURL: zipURL, targetDir: root.appendingPathComponent("out", isDirectory: true)))
    }
}
