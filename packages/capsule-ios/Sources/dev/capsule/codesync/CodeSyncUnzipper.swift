// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncUnzipper.swift
//  Capsule iOS
//
//  Port of dev.capsule.codesync.CodeSyncUnzipper (Android, java.util.zip) — ZIP
//  extraction for OTA bundles via ZIPFoundation (Apple + Linux).
//
//  Security: rejects **zip-slip** — any entry whose resolved path escapes `targetDir`
//  (absolute paths, `..` segments) aborts the whole extraction. A bundle that fails
//  mid-way may leave partial files inside `targetDir`; callers own the staging
//  directory and delete it on failure (the manager does).
//

import Foundation
import ZIPFoundation

public enum CodeSyncUnzipper {
    public static func unzip(zipURL: URL, targetDir: URL) -> Bool {
        let fileManager = FileManager.default
        guard (try? Data(contentsOf: zipURL)) != nil, fileManager.fileExists(atPath: zipURL.path)
        else { return false }
        do {
            try fileManager.createDirectory(at: targetDir, withIntermediateDirectories: true)
        } catch {
            return false
        }
        let targetRoot = targetDir.standardizedFileURL.path + "/"

        let archive: Archive
        do {
            archive = try Archive(url: zipURL, accessMode: .read)
        } catch {
            return false
        }

        for entry in archive {
            // Rooted names ("/abs", "C:\…") resolve unpredictably per platform — reject.
            if entry.path.hasPrefix("/") || entry.path.hasPrefix("\\") || entry.path.contains(":") {
                return false
            }
            let destination = targetDir.appendingPathComponent(entry.path)
            if !destination.standardizedFileURL.path.hasPrefix(targetRoot) {
                return false // zip-slip
            }
            if entry.type == .directory {
                do {
                    try fileManager.createDirectory(
                        at: destination, withIntermediateDirectories: true)
                } catch {
                    return false
                }
            } else {
                do {
                    let parent = destination.deletingLastPathComponent()
                    try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
                    // ZIPFoundation's extract refuses existing destinations — remove first so
                    // re-extraction over a previous run succeeds (Android parity).
                    if fileManager.fileExists(atPath: destination.path) {
                        try fileManager.removeItem(at: destination)
                    }
                    _ = try archive.extract(entry, to: destination)
                } catch {
                    return false
                }
            }
        }
        return true
    }
}
