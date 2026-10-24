// Docs: docs/contributing/codesync-internals.md
//
//  FileBundleStore.swift
//  Capsule iOS
//
//  Port of dev.capsule.runtime.FileBundleStore (Android) — BundleStore backed by a
//  directory on the local filesystem (e.g. `FileManager.urls(for: .documentDirectory)/bundles`).
//
//  Layout under root:
//    root/active/     <- currently served bundle
//    root/previous/   <- last known-good bundle (rollback target)
//
//  The swap in install() follows the sequence documented in codesync-internals.md
//  ("rename current -> previous, new -> current"). A bundle is considered valid only if
//  it contains `www/index.html`.
//
//  Uses only Foundation file APIs, so it is unit-testable anywhere (including Linux).
//

import Foundation

public final class FileBundleStore: BundleStore {
    private let root: URL
    private let fileManager: FileManager

    private var active: URL { root.appendingPathComponent("active", isDirectory: true) }
    private var previous: URL { root.appendingPathComponent("previous", isDirectory: true) }

    public init(root: URL, fileManager: FileManager = .default) {
        self.root = root
        self.fileManager = fileManager
    }

    public func activeDir() -> URL? {
        Self.isValidBundle(active, fileManager: fileManager) ? active : nil
    }

    public func install(staged: URL) throws {
        guard Self.isValidBundle(staged, fileManager: fileManager) else {
            throw BundleStoreError.missingIndexHTML(path: staged.path)
        }
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)

        // Demote a valid active to previous; a corrupt/absent active is simply discarded
        // by the staged move below (move clears its destination first). We never promote
        // a bad bundle to the rollback slot.
        if Self.isValidBundle(active, fileManager: fileManager) {
            try move(from: active, to: previous)
        }
        try move(from: staged, to: active)
    }

    public func hasPrevious() -> Bool {
        Self.isValidBundle(previous, fileManager: fileManager)
    }

    public func rollback() -> Bool {
        guard Self.isValidBundle(previous, fileManager: fileManager) else { return false }
        try? move(from: previous, to: active)
        return true
    }

    // MARK: - Internals

    static func isValidBundle(_ dir: URL, fileManager: FileManager) -> Bool {
        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: dir.path, isDirectory: &isDir), isDir.boolValue else {
            return false
        }
        return fileManager.fileExists(atPath: dir.appendingPathComponent("www/index.html").path)
    }

    /// Move `from` to `to`, clearing `to` first. Atomic rename, with a recursive copy
    /// fallback for the rare cross-device case.
    private func move(from: URL, to: URL) throws {
        if fileManager.fileExists(atPath: to.path) {
            try fileManager.removeItem(at: to)
        }
        do {
            try fileManager.moveItem(at: from, to: to)
        } catch {
            try fileManager.copyItem(at: from, to: to)
            try fileManager.removeItem(at: from)
        }
    }
}
