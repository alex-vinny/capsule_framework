// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncModelsTests.swift
//  CapsuleTests
//
//  Pins the wire decode to the exact check-endpoint shape documented in codesync-internals.md.
//

import XCTest
@testable import Capsule

final class CodeSyncModelsTests: XCTestCase {

    /// Verbatim example response from docs/contributing/codesync-internals.md ("Update Check Endpoint").
    private let docExample = """
        {
          "latestBuildNumber": 47,
          "bundle": {
            "id": "6f1c2a7e-0b4d-4c1a-9e2f-3a5b6c7d8e9f",
            "version": "1.4.2",
            "buildNumber": 47,
            "rolloutPercent": 100,
            "url": "https://cdn.capsule.dev/bundles/6f1c2a7e.zip",
            "hash": "sha256:abc123def456",
            "sizeBytes": 284000,
            "mandatory": false
          }
        }
        """

    private func decode(_ json: String) throws -> CheckResponse {
        try JSONDecoder().decode(CheckResponse.self, from: Data(json.utf8))
    }

    func testDecodesTheDocumentedCheckResponseShape() throws {
        let response = try decode(docExample)
        XCTAssertEqual(response.latestBuildNumber, 47)
        XCTAssertEqual(response.bundle.id, "6f1c2a7e-0b4d-4c1a-9e2f-3a5b6c7d8e9f")
        XCTAssertEqual(response.bundle.version, "1.4.2")
        XCTAssertEqual(response.bundle.buildNumber, 47)
        XCTAssertEqual(response.bundle.rolloutPercent, 100)
        XCTAssertEqual(response.bundle.sizeBytes, 284_000)
        XCTAssertFalse(response.bundle.mandatory)
    }

    func testSHA256PrefixIsStrippedForVerification() throws {
        let response = try decode(docExample)
        XCTAssertEqual(response.bundle.sha256Hex, "abc123def456")
    }

    func testBareHexHashWithoutPrefixAlsoDecodes() throws {
        let response = try decode(
            #"{"latestBuildNumber":1,"bundle":{"id":"b","version":"1.0.0","buildNumber":1,"url":"https://x/b.zip","hash":"deadbeef","sizeBytes":1}}"#
        )
        XCTAssertEqual(response.bundle.sha256Hex, "deadbeef")
    }

    func testMissingOptionalFieldsFallBackToDefaults() throws {
        let response = try decode(
            #"{"latestBuildNumber":1,"bundle":{"id":"b","version":"1.0.0","buildNumber":1,"url":"https://x/b.zip","hash":"sha256:aa","sizeBytes":1}}"#
        )
        XCTAssertEqual(response.bundle.rolloutPercent, 100)  // default
        XCTAssertFalse(response.bundle.mandatory)
    }

    func testGarbageBodyFailsToDecode() {
        XCTAssertThrowsError(try decode("<html>Not Found</html>"))
    }

    func testUpdateResultMirrorsAndroidSemantics() {
        XCTAssertEqual(UpdateResult.upToDate, .upToDate)
        XCTAssertEqual(
            UpdateResult.updateReady(bundlePath: "/data/bundles/x"),
            .updateReady(bundlePath: "/data/bundles/x"))
        XCTAssertNotEqual(UpdateResult.upToDate, .error("boom"))
    }
}
