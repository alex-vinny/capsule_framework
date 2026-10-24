// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncPreferences.swift
//  Capsule iOS
//
//  Port of dev.capsule.codesync.CodeSyncStore (Android) — persistence seam for CodeSync
//  state (device id + current bundle bookkeeping). Injectable so the manager is
//  unit-testable with an in-memory fake; the production implementation survives process
//  death via UserDefaults.
//

import Foundation

public protocol CodeSyncPreferences {
    /// Stable per-installation device id (created on first access).
    func deviceId() -> String

    /// Build number of the currently installed bundle, or -1 when none.
    func currentBuildNumber() -> Int64

    /// Book-keeping after a successful install.
    func setCurrentBundle(buildNumber: Int64, bundleId: String, bundlePath: String)

    func currentBundleId() -> String?

    func currentBundlePath() -> String?
}

#if canImport(Darwin)
/// UserDefaults-backed production implementation.
public final class UserDefaultsCodeSyncPreferences: CodeSyncPreferences {
    private let defaults: UserDefaults
    private let prefix: String

    public init(defaults: UserDefaults = .standard, prefix: String = "codesync") {
        self.defaults = defaults
        self.prefix = prefix
    }

    public func deviceId() -> String {
        let key = prefix + ".device_id"
        if let existing = defaults.string(forKey: key), !existing.isEmpty { return existing }
        let fresh = UUID().uuidString
        defaults.set(fresh, forKey: key)
        return fresh
    }

    public func currentBuildNumber() -> Int64 {
        defaults.integer(forKey: prefix + ".current_build_number").toInt64()
    }

    public func setCurrentBundle(buildNumber: Int64, bundleId: String, bundlePath: String) {
        defaults.set(Int(buildNumber), forKey: prefix + ".current_build_number")
        defaults.set(bundleId, forKey: prefix + ".current_bundle_id")
        defaults.set(bundlePath, forKey: prefix + ".current_bundle_path")
    }

    public func currentBundleId() -> String? {
        defaults.string(forKey: prefix + ".current_bundle_id").flatMap { $0.isEmpty ? nil : $0 }
    }

    public func currentBundlePath() -> String? {
        defaults.string(forKey: prefix + ".current_bundle_path").flatMap { $0.isEmpty ? nil : $0 }
    }
}

private extension Int {
    /// UserDefaults stores integers as Int; normalise to Int64 regardless of platform width.
    func toInt64() -> Int64 { Int64(self) }
}
#endif
