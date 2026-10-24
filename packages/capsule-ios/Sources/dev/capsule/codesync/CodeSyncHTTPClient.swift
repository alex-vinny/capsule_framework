// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncHTTPClient.swift
//  Capsule iOS
//
//  Port of dev.capsule.codesync.CodeSyncTransport (Android, OkHttp) — raw HTTP
//  transport seam for the CodeSync client. The manager owns URL building, decoding,
//  and flow control; the transport moves bytes. A fake drives every flow in tests.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct HTTPResponse {
    public let code: Int
    public let body: Data

    public init(code: Int, body: Data) {
        self.code = code
        self.body = body
    }
}

public protocol CodeSyncHTTPClient {
    /// Fetch `url`. HTTP failures come back as non-200 codes; transport failures throw.
    func get(_ url: String) async throws -> HTTPResponse

    /// POST `jsonBody` to `url` (fire-and-forget callers ignore the result).
    func postJSON(_ url: String, jsonBody: Data) async throws -> HTTPResponse
}

/// URLSession-backed production implementation. Uses the completion-based dataTask via
/// continuations — the one async surface available identically on Apple platforms and
/// Linux (FoundationNetworking).
public struct URLSessionCodeSyncHTTPClient: CodeSyncHTTPClient {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func get(_ url: String) async throws -> HTTPResponse {
        try await run(URLRequest(url: URL(string: url)!))
    }

    public func postJSON(_ url: String, jsonBody: Data) async throws -> HTTPResponse {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonBody
        return try await run(request)
    }

    private func run(_ request: URLRequest) async throws -> HTTPResponse {
        try await withCheckedThrowingContinuation { continuation in
            session.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                continuation.resume(returning: HTTPResponse(code: code, body: data ?? Data()))
            }.resume()
        }
    }
}
