// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
//
//  RequestRouterTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.runtime.RequestRouterTest (Android) — what every request to the embedded
//  server gets back. Sockets are covered by CivetwebServerTests.
//

import XCTest
@testable import Capsule

final class RequestRouterTests: XCTestCase {

    private func get(_ path: String) -> HttpRequest { HttpRequest(method: "GET", path: path) }

    private func text(_ response: HttpResponse) throws -> String {
        switch response.body {
        case .data(let data): return String(decoding: data, as: UTF8.self)
        case .file(let url): return try String(contentsOf: url, encoding: .utf8)
        }
    }

    // MARK: - Static assets

    // The fake deletes its files when released, so tests that read a file keep it alive in a local.

    func testRootServesIndexHtml() throws {
        let assets = FakeStaticAssets(text: ["index.html": "<html>home</html>"])
        let response = RequestRouter(staticAssets: assets).route(get("/"))

        XCTAssertEqual(response.status, 200)
        XCTAssertEqual(response.mimeType, "text/html; charset=utf-8")
        XCTAssertEqual(try text(response), "<html>home</html>")
    }

    func testNestedAssetsAreServedAsFilesWithTheirContentType() throws {
        let assets = FakeStaticAssets(text: ["assets/main.js": "console.log(1)"])
        let response = RequestRouter(staticAssets: assets).route(get("/assets/main.js"))

        XCTAssertEqual(response.status, 200)
        XCTAssertEqual(response.mimeType, "text/javascript; charset=utf-8")
        guard case .file = response.body else { return XCTFail("assets are streamed from disk") }
        XCTAssertEqual(try text(response), "console.log(1)")
    }

    func testMissingAssetIsA404WithTheRoutersSignatureBody() throws {
        let response = RequestRouter(staticAssets: FakeStaticAssets(text: [:])).route(get("/no-such-asset.js"))

        XCTAssertEqual(response.status, 404)
        XCTAssertEqual(try text(response), "Not found: no-such-asset.js")
    }

    func testParentDirectorySegmentsNeverReachTheAssetSource() {
        let assets = FakeStaticAssets(text: ["../server/routes.js": "secret"])

        let response = RequestRouter(staticAssets: assets).route(get("/../server/routes.js"))

        XCTAssertEqual(response.status, 404)
        XCTAssertEqual(assets.requested, [])
    }

    func testApiPathsAreStaticAssetsWhenNoApiHandlerIsInstalled() throws {
        let response = RequestRouter(staticAssets: FakeStaticAssets(text: [:])).route(get("/api/ping"))

        XCTAssertEqual(response.status, 404)
        XCTAssertEqual(try text(response), "Not found: api/ping")
    }

    // MARK: - /api routes

    func testApiRequestsReachTheHandlerWithMethodPathBodyAndHeaders() throws {
        let seen = Recorder()
        let router = RequestRouter(staticAssets: FakeStaticAssets(text: [:])) { method, path, body, headers in
            seen.values = [method, path, body ?? "nil", headers["content-type"] ?? "nil"]
            return HttpRouteResponse(status: 201, body: "{\"ok\":true}", mimeType: "application/json")
        }

        let response = router.route(HttpRequest(
            method: "POST", path: "/api/todos",
            headers: ["content-type": "application/json"], body: Data("{\"t\":\"ü\"}".utf8)
        ))

        XCTAssertEqual(seen.values, ["POST", "/api/todos", "{\"t\":\"ü\"}", "application/json"])
        XCTAssertEqual(response.status, 201)
        XCTAssertEqual(response.mimeType, "application/json")
        XCTAssertEqual(try text(response), "{\"ok\":true}")
    }

    func testAnEmptyBodyReachesTheHandlerAsNil() {
        let seen = Recorder()
        let router = RequestRouter(staticAssets: FakeStaticAssets(text: [:])) { _, _, body, _ in
            seen.values = [body ?? "nil"]
            return HttpRouteResponse(status: 200, body: "", mimeType: "text/plain")
        }

        _ = router.route(HttpRequest(method: "POST", path: "/api/x", body: Data()))

        XCTAssertEqual(seen.values, ["nil"])
    }

    func testUnhandledApiRouteIsA404() throws {
        let router = RequestRouter(staticAssets: FakeStaticAssets(text: [:])) { _, _, _, _ in nil }

        let response = router.route(get("/api/missing"))

        XCTAssertEqual(response.status, 404)
        XCTAssertEqual(try text(response), "No handler for /api/missing")
    }

    func testAFailingApiHandlerIsA500NotACrash() throws {
        struct Boom: Error {}
        let router = RequestRouter(staticAssets: FakeStaticAssets(text: [:])) { _, _, _, _ in throw Boom() }

        let response = router.route(get("/api/explode"))

        XCTAssertEqual(response.status, 500)
        XCTAssertTrue(try text(response).contains("Boom"))
    }

    // MARK: - Content types

    func testContentTypesComeFromTheExtensionCaseInsensitively() {
        XCTAssertEqual(MimeTypes.forPath("lib/engine.WASM"), "application/wasm")
        XCTAssertEqual(MimeTypes.forPath("icons/logo.svg"), "image/svg+xml")
        XCTAssertEqual(MimeTypes.forPath("LICENSE"), "application/octet-stream")
        XCTAssertEqual(MimeTypes.forPath("dir.v2/file"), "application/octet-stream")
    }
}

/// Collects what a handler saw (handlers run on another task, so no captured `var`).
final class Recorder: @unchecked Sendable {
    var values: [String] = []
}
