// Docs: docs/contributing/codesync-internals.md
//
//  CrashLoopGuard.swift
//  Capsule iOS
//
//  Port of dev.capsule.runtime.CrashLoopGuard (Android) — detects crash loops after
//  an over-the-air bundle is applied.
//
//  The contract from `docs/contributing/codesync-internals.md`: if the app crashes `threshold` times
//  within `windowMs` after applying a bundle, the runtime rolls back to the previous
//  known-good bundle.
//
//  Each launch records a timestamp (recordLaunchAttempt) that is cleared only once the
//  web layer reports it loaded successfully (clear, called on notifyAppReady). A launch
//  that crashes before reporting readiness leaves its timestamp behind; isCrashLooping()
//  returns true once `threshold` such unconfirmed launches fall within the trailing
//  `windowMs`.
//
//  Pure logic — time comes from the injected clock, persistence from the injected log —
//  so it is fully unit-testable without an iOS runtime.
//

import Foundation

public final class CrashLoopGuard {
    private let log: CrashLog
    private let clock: Clock
    public let threshold: Int
    public let windowMs: Int64

    public init(
        log: CrashLog,
        clock: Clock = SystemClock(),
        threshold: Int = 3,
        windowMs: Int64 = 60_000
    ) {
        self.log = log
        self.clock = clock
        self.threshold = threshold
        self.windowMs = windowMs
    }

    /// Record an unconfirmed launch attempt. Call once at the start of each launch.
    public func recordLaunchAttempt() {
        log.record(timestampMs: clock.now())
    }

    /// True when `threshold` or more unconfirmed launches occurred within the trailing window.
    public func isCrashLooping() -> Bool {
        let now = clock.now()
        return log.timestamps().filter { now - $0 <= windowMs }.count >= threshold
    }

    /// Clear the crash record — called when the app boots healthy and again after a
    /// rollback (the restored bundle starts with a clean slate).
    public func clear() {
        log.clear()
    }
}
