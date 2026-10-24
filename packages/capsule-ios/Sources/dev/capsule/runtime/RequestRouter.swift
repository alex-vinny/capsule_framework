// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
//
//  RequestRouter.swift
//  Capsule iOS
//
//  Decides what every request to the embedded server gets back: `/api/` paths go to the QuickJS
//  route handler, everything else is a static asset (`/` → `index.html`). Free of any HTTP
//  library, so it is unit-tested on its own; `CivetwebServer` only moves bytes between the socket
//  and `route(_:)`. Mirrors Android's RequestRouter.kt rule for rule.
//

import Foundation

/// What a QuickJS `/api` route produced (mirrors Android's `HttpRouteResponse`).
public struct HttpRouteResponse: Equatable {
    public let status: Int
    public let body: String
    public let mimeType: String

    public init(status: Int, body: String, mimeType: String) {
        self.status = status
        self.body = body
        self.mimeType = mimeType
    }
}

/// The `/api` route handler — the QuickJS bridge in production. Arguments: method, path, body
/// (nil when empty), headers (lower-cased names). Returns nil when no route matches.
public typealias ApiHandler = (String, String, String?, [String: String]) async throws -> HttpRouteResponse?

/// A request as the embedded server received it, independent of the HTTP library.
public struct HttpRequest {
    public let method: String
    /// Decoded path without the query string, e.g. `/api/todos`.
    public let path: String
    /// Header names are lower-cased (HTTP header names are case-insensitive).
    public let headers: [String: String]
    public let body: Data?

    public init(method: String, path: String, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method
        self.path = path
        self.headers = headers
        self.body = body
    }
}

public enum HttpBody: Equatable {
    case data(Data)
    /// A file streamed from disk by the server.
    case file(URL)
}

public struct HttpResponse: Equatable {
    public let status: Int
    public let mimeType: String
    public let body: HttpBody

    static func text(_ status: Int, _ text: String) -> HttpResponse {
        HttpResponse(status: status, mimeType: MimeTypes.text, body: .data(Data(text.utf8)))
    }
}

public final class RequestRouter {
    private let staticAssets: StaticAssets
    private let apiHandler: ApiHandler?

    public init(staticAssets: StaticAssets, apiHandler: ApiHandler? = nil) {
        self.staticAssets = staticAssets
        self.apiHandler = apiHandler
    }

    /// Blocking: the server calls this on one of its own worker threads. Never throws.
    public func route(_ request: HttpRequest) -> HttpResponse {
        if request.path.hasPrefix("/api/"), let apiHandler {
            return routeApi(apiHandler, request)
        }
        return routeAsset(request.path)
    }

    private func routeApi(_ handler: @escaping ApiHandler, _ request: HttpRequest) -> HttpResponse {
        let body = request.body.flatMap { $0.isEmpty ? nil : String(decoding: $0, as: UTF8.self) }
        switch waitFor({ try await handler(request.method, request.path, body, request.headers) }) {
        case .success(let response?):
            return HttpResponse(status: response.status, mimeType: response.mimeType, body: .data(Data(response.body.utf8)))
        case .success(nil):
            return .text(404, "No handler for \(request.path)")
        case .failure(let error):
            return .text(500, "Route \(request.path) failed: \(error)")
        }
    }

    private func routeAsset(_ path: String) -> HttpResponse {
        var assetPath = String(path.drop { $0 == "/" })
        if assetPath.isEmpty { assetPath = "index.html" }
        // CivetWeb already removes `..` segments; this keeps the router safe on its own.
        if assetPath.split(separator: "/", omittingEmptySubsequences: false).contains("..") {
            return notFound(assetPath)
        }
        guard let url = staticAssets.url(for: assetPath) else { return notFound(assetPath) }
        return HttpResponse(status: 200, mimeType: MimeTypes.forPath(assetPath), body: .file(url))
    }

    private func notFound(_ assetPath: String) -> HttpResponse {
        .text(404, "Not found: \(assetPath)")
    }
}

/// Runs async work to completion from a synchronous server worker thread. Those threads belong to
/// CivetWeb, not to Swift concurrency's cooperative pool, so blocking one here starves nothing.
private func waitFor<T>(_ work: @escaping () async throws -> T) -> Result<T, Error> {
    let box = ResultBox<T>()
    let done = DispatchSemaphore(value: 0)
    // The calling thread blocks until the task finishes, so `work` is never used concurrently.
    let job = UncheckedSendable(value: work)
    Task.detached {
        do {
            box.result = .success(try await job.value())
        } catch {
            box.result = .failure(error)
        }
        done.signal()
    }
    done.wait()
    return box.result!
}

/// Hand-off cell for `waitFor`: written once by the task, read after the semaphore.
private final class ResultBox<T>: @unchecked Sendable {
    var result: Result<T, Error>?
}

/// Carries a value across a concurrency boundary the caller has proven safe (see call sites).
struct UncheckedSendable<T>: @unchecked Sendable {
    let value: T
}

/// Content types for static assets, by file extension (same table as Android's MimeTypes).
public enum MimeTypes {
    public static let text = "text/plain; charset=utf-8"
    private static let fallback = "application/octet-stream"

    private static let byExtension: [String: String] = [
        "html": "text/html; charset=utf-8",
        "htm": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "map": "application/json; charset=utf-8",
        "webmanifest": "application/manifest+json",
        "txt": text,
        "xml": "application/xml",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "avif": "image/avif",
        "ico": "image/x-icon",
        "woff": "font/woff",
        "woff2": "font/woff2",
        "ttf": "font/ttf",
        "otf": "font/otf",
        "wasm": "application/wasm",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "mp4": "video/mp4",
        "webm": "video/webm",
        "pdf": "application/pdf",
    ]

    public static func forPath(_ path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        guard let dot = name.lastIndex(of: ".") else { return fallback }
        return byExtension[name[name.index(after: dot)...].lowercased()] ?? fallback
    }
}
