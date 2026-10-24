// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
//
//  CivetwebServer.swift
//  Capsule iOS
//
//  `CapsuleServer` on CivetWeb (packages/native/civetweb) — the same C server the Android shell
//  runs (CivetwebServer.kt), so `/api` and asset semantics are identical on both platforms.
//
//  - Binds 127.0.0.1:`port` only: nothing off the device can reach it.
//  - Readiness: `mg_start2` returns only once the socket is bound and listening, so `start()`
//    meets the contract without a probe or retry loop.
//  - CivetWeb never serves files itself (built with NO_FILES): `begin_request` hands every
//    request to `RequestRouter` and writes its `HttpResponse` back.
//

import CCivetweb
import Foundation
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

public final class CivetwebServer: CapsuleServer {
    public let port: Int
    private let router: RequestRouter
    private let workerThreads: Int

    private let lock = NSLock()
    private var context: OpaquePointer?
    /// Keeps `self` alive while CivetWeb holds it as `user_data`; released after `mg_stop`.
    private var retainedSelf: Unmanaged<CivetwebServer>?

    private static let maxRequestBody = 32 * 1024 * 1024
    private static let streamChunk = 64 * 1024

    /// - Parameter workerThreads: CivetWeb holds one worker per open connection; WKWebView keeps
    ///   up to 6 alive per host.
    public init(staticAssets: StaticAssets, port: Int, apiHandler: ApiHandler? = nil, workerThreads: Int = 16) {
        self.port = port
        self.router = RequestRouter(staticAssets: staticAssets, apiHandler: apiHandler)
        self.workerThreads = workerThreads
    }

    // MARK: - CapsuleServer

    public func start() async throws {
        // A server stopped on this port moments ago may still be shutting down; it owns the port
        // until it has.
        await Shutdowns.wait(port: port)
        try startNow()
    }

    /// Returns at once; the port is released in the background. `mg_stop` joins the worker
    /// threads, and a worker can be inside an `/api` route waiting on the main thread — joining
    /// on the caller's (main) thread would deadlock. `start()` waits for this shutdown.
    public func stop() {
        lock.lock()
        let current = context
        let retained = retainedSelf
        context = nil
        retainedSelf = nil
        lock.unlock()

        guard let current else { return }
        Shutdowns.begin(port: port) {
            mg_stop(current)
            retained?.release()
        }
    }

    // MARK: - Startup

    private static let libraryInitialized: Void = {
        _ = mg_init_library(0)
    }()

    private func startNow() throws {
        lock.lock()
        defer { lock.unlock() }
        guard context == nil else { return }
        _ = CivetwebServer.libraryInitialized

        var callbacks = mg_callbacks()
        callbacks.begin_request = { connection in CivetwebServer.handle(connection) }

        let optionStrings: [String] = ["listening_ports", "127.0.0.1:\(port)",
                                       "num_threads", "\(workerThreads)",
                                       "enable_keep_alive", "yes"]
        let options: [UnsafeMutablePointer<CChar>?] = optionStrings.map { strdup($0) }
        defer { options.forEach { free($0) } }
        var optionPointers: [UnsafePointer<CChar>?] = options.map { UnsafePointer($0) } + [nil]
        var errorText = [CChar](repeating: 0, count: 256)

        let retained = Unmanaged.passRetained(self)
        var errorCode: UInt32 = 0
        let started: OpaquePointer? = errorText.withUnsafeMutableBufferPointer { text in
            optionPointers.withUnsafeMutableBufferPointer { optionList in
                withUnsafePointer(to: &callbacks) { callbackPointer in
                    var error = mg_error_data(code: 0, code_sub: 0, text: text.baseAddress, text_buffer_size: text.count)
                    var initData = mg_init_data(
                        callbacks: callbackPointer,
                        user_data: retained.toOpaque(),
                        configuration_options: optionList.baseAddress
                    )
                    let context = mg_start2(&initData, &error)
                    errorCode = error.code
                    return context
                }
            }
        }

        guard let started else {
            retained.release()
            let detail = String(cString: errorText)
            if errorCode == UInt32(MG_ERROR_DATA_CODE_INIT_PORTS_FAILED) {
                throw ServerStartupError.portInUse(port: port, detail: detail)
            }
            throw ServerStartupError.failed(port: port, detail: detail)
        }
        context = started
        retainedSelf = retained
    }

    // MARK: - Requests (CivetWeb worker threads)

    private static func handle(_ connection: OpaquePointer?) -> Int32 {
        guard let connection,
              let info = mg_get_request_info(connection),
              let userData = info.pointee.user_data
        else { return 0 }
        let server = Unmanaged<CivetwebServer>.fromOpaque(userData).takeUnretainedValue()
        return Int32(server.serve(connection, info))
    }

    private func serve(_ connection: OpaquePointer, _ info: UnsafePointer<mg_request_info>) -> Int {
        let method = String(cString: info.pointee.request_method)
        let path = info.pointee.local_uri.map { String(cString: $0) } ?? "/"
        guard let body = readBody(connection, expected: info.pointee.content_length) else {
            let tooLarge = HttpResponse.text(413, "Request body too large")
            send(tooLarge, to: connection, headOnly: false)
            return tooLarge.status
        }
        let request = HttpRequest(method: method, path: path, headers: headers(of: info),
                                  body: body.isEmpty ? nil : body)
        let response = router.route(request)
        return send(response, to: connection, headOnly: method == "HEAD")
    }

    /// Lower-cased names; repeated headers joined with ", " (RFC 9110 §5.3).
    private func headers(of info: UnsafePointer<mg_request_info>) -> [String: String] {
        let count = Int(info.pointee.num_headers)
        return withUnsafePointer(to: info.pointee.http_headers) { tuple in
            tuple.withMemoryRebound(to: mg_header.self, capacity: count) { list in
                var headers: [String: String] = [:]
                for i in 0..<count {
                    guard let rawName = list[i].name, let rawValue = list[i].value else { continue }
                    let name = String(cString: rawName).lowercased()
                    let value = String(cString: rawValue)
                    headers[name] = headers[name].map { "\($0), \(value)" } ?? value
                }
                return headers
            }
        }
    }

    /// The whole request body (Content-Length or chunked); nil when it exceeds the limit.
    private func readBody(_ connection: OpaquePointer, expected: Int64) -> Data? {
        if expected == 0 { return Data() }
        if expected > Int64(CivetwebServer.maxRequestBody) { return nil }
        var body = Data()
        var chunk = [UInt8](repeating: 0, count: CivetwebServer.streamChunk)
        while expected < 0 || body.count < Int(expected) {
            let n = chunk.withUnsafeMutableBytes { mg_read(connection, $0.baseAddress, $0.count) }
            if n <= 0 { break }
            body.append(contentsOf: chunk[0..<Int(n)])
            if body.count > CivetwebServer.maxRequestBody { return nil }
        }
        return body
    }

    /// Writes `response`; returns the status actually sent (500 if a file vanished meanwhile).
    @discardableResult
    private func send(_ response: HttpResponse, to connection: OpaquePointer, headOnly: Bool) -> Int {
        switch response.body {
        case .data(let data):
            sendHeaders(response, length: data.count, to: connection)
            if !headOnly {
                _ = data.withUnsafeBytes { mg_write(connection, $0.baseAddress, $0.count) }
            }
            return response.status

        case .file(let url):
            guard let file = try? FileHandle(forReadingFrom: url),
                  let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber
            else {
                return send(.text(500, "Could not read \(url.lastPathComponent)"), to: connection, headOnly: headOnly)
            }
            defer { try? file.close() }
            sendHeaders(response, length: size.intValue, to: connection)
            if headOnly { return response.status }
            while true {
                let chunk = file.readData(ofLength: CivetwebServer.streamChunk)
                if chunk.isEmpty { break }
                let written = chunk.withUnsafeBytes { mg_write(connection, $0.baseAddress, $0.count) }
                if written < 0 { break } // client went away
            }
            return response.status
        }
    }

    private func sendHeaders(_ response: HttpResponse, length: Int, to connection: OpaquePointer) {
        mg_response_header_start(connection, Int32(response.status))
        mg_response_header_add(connection, "Content-Type", response.mimeType, -1)
        // Revalidate every load: an OTA update swaps files behind the same URLs.
        mg_response_header_add(connection, "Cache-Control", "no-cache", -1)
        mg_response_header_add(connection, "Content-Length", String(length), -1)
        mg_response_header_send(connection)
    }
}

/// In-flight shutdowns by port — process-wide, since a new server instance reuses the port.
private enum Shutdowns {
    private static let lock = NSLock()
    private static var pending: [Int: DispatchGroup] = [:]

    static func begin(port: Int, _ work: @escaping () -> Void) {
        let group = DispatchGroup()
        lock.lock()
        pending[port] = group
        lock.unlock()
        // `work` runs exactly once, on this queue — never concurrently with anything else.
        let job = UncheckedSendable(value: work)
        DispatchQueue.global(qos: .utility).async(group: group) { job.value() }
    }

    static func wait(port: Int) async {
        guard let group = take(port: port) else { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            group.notify(queue: .global()) { continuation.resume() }
        }
    }

    private static func take(port: Int) -> DispatchGroup? {
        lock.lock()
        defer { lock.unlock() }
        return pending.removeValue(forKey: port)
    }
}
