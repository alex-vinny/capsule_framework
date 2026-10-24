// Docs: docs/contributing/codesync-internals.md
//
//  FileBundleStoreTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.runtime.FileBundleStoreTest (Android) — same ten cases over the
//  URL-based Swift implementation. Pure Foundation, runs on Linux too.
//

import XCTest
@testable import Capsule

final class FileBundleStoreTests: XCTestCase {

    private var root: URL!
    private var toCleanup: [URL] = []

    override func setUpWithError() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("bundlestore-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        root = dir
        toCleanup.append(dir)
    }

    override func tearDownWithError() throws {
        for url in toCleanup {
            try? FileManager.default.removeItem(at: url)
        }
        toCleanup.removeAll()
    }

    private func store() -> FileBundleStore {
        FileBundleStore(root: root.appendingPathComponent("bundles", isDirectory: true))
    }

    /// Build a valid bundle directory with www/index.html (+ optional server/bundle.js + marker).
    private func bundle(named name: String, marker: String, withServer: Bool = true) throws -> URL {
        let dir = root.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(
            at: dir.appendingPathComponent("www", isDirectory: true),
            withIntermediateDirectories: true)
        try "<!-- \(marker) -->".write(
            to: dir.appendingPathComponent("www/index.html"), atomically: true, encoding: .utf8)
        try marker.write(
            to: dir.appendingPathComponent("www/marker.txt"), atomically: true, encoding: .utf8)
        if withServer {
            try FileManager.default.createDirectory(
                at: dir.appendingPathComponent("server", isDirectory: true),
                withIntermediateDirectories: true)
            try "/* \(marker) */".write(
                to: dir.appendingPathComponent("server/bundle.js"), atomically: true, encoding: .utf8)
        }
        return dir
    }

    private func markerOf(_ dir: URL?) -> String? {
        guard let dir,
            let data = try? Data(contentsOf: dir.appendingPathComponent("www/marker.txt"))
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func testNoBundleInstalledYieldsNilActiveAndNoPrevious() {
        let s = store()
        XCTAssertNil(s.activeDir())
        XCTAssertFalse(s.hasPrevious())
        XCTAssertFalse(s.rollback())
    }

    func testInstallMakesABundleActive() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1"))
        XCTAssertEqual(markerOf(s.activeDir()), "v1")
        XCTAssertFalse(s.hasPrevious())
    }

    func testInstallCarriesServerBundleAlongsideWWW() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1", withServer: true))
        let active = s.activeDir()!
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: active.appendingPathComponent("www/index.html").path))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: active.appendingPathComponent("server/bundle.js").path))
    }

    func testSecondInstallDemotesTheFirstToPrevious() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1"))
        try s.install(staged: try bundle(named: "v2", marker: "v2"))
        XCTAssertEqual(markerOf(s.activeDir()), "v2")
        XCTAssertTrue(s.hasPrevious())
    }

    func testRollbackRestoresThePreviousBundleAsActive() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1"))
        try s.install(staged: try bundle(named: "v2", marker: "v2"))
        XCTAssertTrue(s.rollback())
        XCTAssertEqual(markerOf(s.activeDir()), "v1")
    }

    func testRollbackReturnsFalseWhenThereIsNoPrevious() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1"))
        XCTAssertFalse(s.rollback())
        XCTAssertEqual(markerOf(s.activeDir()), "v1")  // active untouched
    }

    func testRollbackConsumesThePreviousSlot() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1"))
        try s.install(staged: try bundle(named: "v2", marker: "v2"))
        XCTAssertTrue(s.rollback())
        XCTAssertFalse(s.hasPrevious())
        XCTAssertFalse(s.rollback())
    }

    func testInstallingRejectsABundleWithoutWWWIndexHTML() throws {
        let s = store()
        let bad = root.appendingPathComponent("bad", isDirectory: true)
        try FileManager.default.createDirectory(
            at: bad.appendingPathComponent("www", isDirectory: true),
            withIntermediateDirectories: true)  // no index.html
        XCTAssertThrowsError(try s.install(staged: bad)) { error in
            XCTAssertEqual(
                error as? BundleStoreError,
                BundleStoreError.missingIndexHTML(path: bad.path))
        }
    }

    func testThreeInstallsKeepOnlyTheImmediatelyPreviousBundle() throws {
        let s = store()
        try s.install(staged: try bundle(named: "v1", marker: "v1"))
        try s.install(staged: try bundle(named: "v2", marker: "v2"))
        try s.install(staged: try bundle(named: "v3", marker: "v3"))
        XCTAssertEqual(markerOf(s.activeDir()), "v3")
        XCTAssertTrue(s.rollback())
        XCTAssertEqual(markerOf(s.activeDir()), "v2")  // v1 is gone
        XCTAssertFalse(s.hasPrevious())
    }

    func testStoreSurvivesReconstructionOverTheSameRoot() throws {
        let persistedRoot = root.appendingPathComponent("persisted", isDirectory: true)
        try FileBundleStore(root: persistedRoot).install(
            staged: try bundle(named: "v1", marker: "v1"))
        // A fresh instance over the same root sees the installed bundle.
        XCTAssertEqual(markerOf(FileBundleStore(root: persistedRoot).activeDir()), "v1")
    }
}
