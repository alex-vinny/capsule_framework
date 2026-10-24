// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
//
//  CivetwebServerTests.swift
//  CapsuleTests
//
//  Real-socket tests for CivetwebServer (CivetWeb + the Swift bridge) — the iOS twin of the
//  Android instrumented CivetwebServerTest. Runs on Linux too.
//
//  The readiness contract (docs/project/incidents/2026-10-embedded-server-startup.md) is asserted with no sleep
//  and no retry: a request immediately after `start()` returns must succeed.
//

import XCTest
@testable import Capsule
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class CivetwebServerTests: XCTestCase {

    private var servers: [CivetwebServer] = []

    override func tearDown() {
        servers.forEach { $0.stop() }
        servers.removeAll()
    }

    /// A random high port; collisions are only possible with an unrelated process.
    private func freePort() -> Int { Int.random(in: 20_000...60_000) }

    private func server(
        port: Int? = nil,
        files: [String: String] = ["index.html": "<html>cold start</html>"],
        apiHandler: ApiHandler? = nil
    ) -> CivetwebServer {
        let server = CivetwebServer(staticAssets: FakeStaticAssets(text: files), port: port ?? freePort(), apiHandler: apiHandler)
        servers.append(server)
        return server
    }

    private struct Reply {
        let status: Int
        let headers: [AnyHashable: Any]
        let body: Data
        var text: String { String(decoding: body, as: UTF8.self) }
        func header(_ name: String) -> String? {
            headers.first { ($0.key as? String)?.lowercased() == name.lowercased() }?.value as? String
        }
    }

    private func fetch(_ port: Int, _ path: String, method: String = "GET",
                       body: Data? = nil, headers: [String: String] = [:]) async throws -> Reply {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = method
        request.httpBody = body
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let session = URLSession(configuration: .ephemeral)
        defer { session.finishTasksAndInvalidate() }
        return try await withCheckedThrowingContinuation { continuation in
            session.dataTask(with: request) { data, response, error in
                if let error { return continuation.resume(throwing: error) }
                let http = response as! HTTPURLResponse
                continuation.resume(returning: Reply(status: http.statusCode, headers: http.allHeaderFields, body: data ?? Data()))
            }.resume()
        }
    }

    // MARK: - The readiness contract

    func testAGetImmediatelyAfterStartReturnsSucceeds() async throws {
        let s = server()
        try await s.start() // must not return until the socket accepts — the contract under test

        let reply = try await fetch(s.port, "/")

        XCTAssertEqual(reply.status, 200)
        XCTAssertEqual(reply.text, "<html>cold start</html>")
    }

    // MARK: - Serving

    func testServesAssetsWithContentTypeAnd404sMissingOnes() async throws {
        let s = server(files: ["assets/main.js": "console.log(1)"])
        try await s.start()

        let js = try await fetch(s.port, "/assets/main.js")
        XCTAssertEqual(js.status, 200)
        XCTAssertEqual(js.header("Content-Type"), "text/javascript; charset=utf-8")
        XCTAssertEqual(js.header("Cache-Control"), "no-cache")
        XCTAssertEqual(js.text, "console.log(1)")

        let missing = try await fetch(s.port, "/no-such-asset.js")
        XCTAssertEqual(missing.status, 404)
        XCTAssertEqual(missing.text, "Not found: no-such-asset.js")
    }

    func testALargeAssetStreamsIntact() async throws {
        let big = Data((0..<1_000_003).map { UInt8($0 % 251) }) // > the 64 KiB chunk, odd size
        let s = CivetwebServer(staticAssets: FakeStaticAssets(["blob.bin": big]), port: freePort())
        servers.append(s)
        try await s.start()

        let reply = try await fetch(s.port, "/blob.bin")

        XCTAssertEqual(reply.header("Content-Length"), "1000003")
        XCTAssertEqual(reply.body, big)
    }

    func testApiRequestsCarryMethodBodyAndHeadersThroughCivetweb() async throws {
        let seen = Recorder()
        let s = server { method, path, body, headers in
            seen.values = [method, path, body ?? "nil", headers["x-capsule-test"] ?? "nil"]
            return HttpRouteResponse(status: 201, body: "{\"echo\":\"\(body ?? "")\"}", mimeType: "application/json")
        }
        try await s.start()

        let reply = try await fetch(s.port, "/api/echo", method: "POST",
                                    body: Data("héllo".utf8), headers: ["X-Capsule-Test": "yes"])

        XCTAssertEqual(reply.status, 201)
        XCTAssertEqual(reply.header("Content-Type"), "application/json")
        XCTAssertEqual(reply.text, "{\"echo\":\"héllo\"}")
        XCTAssertEqual(seen.values, ["POST", "/api/echo", "héllo", "yes"])
    }

    func testHeadReturnsHeadersWithoutABody() async throws {
        let s = server()
        try await s.start()

        let reply = try await fetch(s.port, "/", method: "HEAD")

        XCTAssertEqual(reply.status, 200)
        XCTAssertEqual(reply.header("Content-Length"), "\("<html>cold start</html>".utf8.count)")
        XCTAssertEqual(reply.body.count, 0)
    }

    // MARK: - Lifecycle & failures

    func testPortAlreadyInUseSurfacesATypedError() async throws {
        let holder = server()
        try await holder.start()

        do {
            try await server(port: holder.port).start()
            XCTFail("expected ServerStartupError.portInUse")
        } catch ServerStartupError.portInUse(let port, _) {
            XCTAssertEqual(port, holder.port)
        }
    }

    func testANewServerCanStartOnThePortRightAfterStop() async throws {
        let port = freePort()
        let first = server(port: port)
        try await first.start()
        first.stop() // returns at once; the port is released in the background

        let second = server(port: port, files: ["index.html": "second"])
        try await second.start() // must wait for the first shutdown, not fail with "in use"

        let reply = try await fetch(port, "/")
        XCTAssertEqual(reply.text, "second")
    }
}
