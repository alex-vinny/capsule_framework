// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
//
//  CapsuleServer.swift
//  Capsule iOS
//
//  The embedded loopback HTTP server that fronts the QuickJS route runtime (adr-001, adr-004).
//  Mirrors Android's `CapsuleServer` — same contract, same CivetWeb implementation underneath.
//

import Foundation

public protocol CapsuleServer: AnyObject {
    /// The deterministic port (derived from `appId`, adr-001 #7) the server serves on.
    var port: Int { get }

    /// Starts the server.
    ///
    /// **Readiness contract** (docs/project/incidents/2026-10-embedded-server-startup.md): must not return until
    /// the server accepts connections on `port` — a request made immediately after must succeed.
    /// Failures throw `ServerStartupError`, never a silent thread-internal death.
    func start() async throws

    /// Stops the server. Must not block the calling (main) thread on in-flight requests; the port
    /// may be released asynchronously, but a later `start()` on the same port must succeed.
    func stop()
}

public enum ServerStartupError: Error, Equatable {
    /// The port could not be bound — typically held by another process.
    case portInUse(port: Int, detail: String)
    /// Any other startup failure.
    case failed(port: Int, detail: String)
}
