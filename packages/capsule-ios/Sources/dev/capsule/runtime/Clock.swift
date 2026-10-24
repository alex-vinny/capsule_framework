// Docs: docs/contributing/ios-bring-up.md
//
//  Clock.swift
//  Capsule iOS
//
//  Port of dev.capsule.runtime.Clock (Android) — wall-clock abstraction so
//  crash-loop timing can be driven by a fake clock in unit tests.
//

import Foundation

public protocol Clock {
    /// Milliseconds since epoch (same semantics as the Kotlin `Clock.now(): Long`).
    func now() -> Int64
}

/// Production clock backed by the system time.
public struct SystemClock: Clock {
    public init() {}
    public func now() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}
