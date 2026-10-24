// Docs: docs/contributing/codesync-internals.md
//
//  CrashLog.swift
//  Capsule iOS
//
//  Port of dev.capsule.runtime.CrashLog (Android) — persistent record of launch
//  attempts that have not yet been confirmed healthy. Implementations must be
//  durable across process death (UserDefaults on iOS).
//

import Foundation

public protocol CrashLog {
    /// Append a launch-attempt timestamp (epoch millis).
    func record(timestampMs: Int64)

    /// All recorded timestamps (order not guaranteed).
    func timestamps() -> [Int64]

    /// Drop all recorded timestamps.
    func clear()
}

#if canImport(Darwin)
/// UserDefaults-backed implementation (survives process death).
public final class UserDefaultsCrashLog: CrashLog {
    private let defaults: UserDefaults
    private let key = "capsule.crashlog.timestamps"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func record(timestampMs: Int64) {
        var entries = timestamps()
        entries.append(timestampMs)
        defaults.set(entries, forKey: key)
    }

    public func timestamps() -> [Int64] {
        defaults.array(forKey: key)?.compactMap { $0 as? Int64 } ?? []
    }

    public func clear() {
        defaults.removeObject(forKey: key)
    }
}
#endif
