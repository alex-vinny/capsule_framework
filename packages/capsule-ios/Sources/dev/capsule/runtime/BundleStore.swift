// Docs: docs/contributing/codesync-internals.md
//
//  BundleStore.swift
//  Capsule iOS
//
//  Port of dev.capsule.runtime.BundleStore (Android) — on-device storage for web/server
//  bundles with a two-slot model: `active` (currently served) and `previous`
//  (last known-good) so a bad over-the-air update can be rolled back.
//
//  Deliberately URL-based (`URL`, not `java.io.File` / platform types) — this is the
//  seam the 2026-06-26 contract-readiness audit flagged as the one platform leak on the
//  Android side (ios-bring-up.md). iOS leads with the neutral type.
//

import Foundation

/// Errors thrown by `install` for an invalid staged bundle.
public enum BundleStoreError: Error, Equatable {
    /// The staged directory does not contain `www/index.html` — the native client's entry point.
    case missingIndexHTML(path: String)
}

public protocol BundleStore {
    /// The currently active bundle directory, or nil if none is installed/valid.
    func activeDir() -> URL?

    /// Atomically promote `staged` to active, demoting the current active to `previous`
    /// (replacing any earlier previous). `staged` must be a valid bundle (contain
    /// `www/index.html`).
    func install(staged: URL) throws

    /// True if a previous known-good bundle exists to roll back to.
    func hasPrevious() -> Bool

    /// Restore the previous bundle as active, discarding the current (bad) active.
    /// Returns false if there was no previous bundle.
    @discardableResult
    func rollback() -> Bool
}
