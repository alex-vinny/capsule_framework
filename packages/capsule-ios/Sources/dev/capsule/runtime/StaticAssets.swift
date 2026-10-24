// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
//
//  StaticAssets.swift
//  Capsule iOS
//
//  Static asset source for the embedded server — the seam that keeps `RequestRouter`
//  unit-testable (mirrors Android's `StaticAssets`). On iOS bundle assets are real files, so the
//  source hands back a file URL and the server streams it from disk.
//

import Foundation

public protocol StaticAssets {
    /// The file to serve for `path` (no leading slash, e.g. `index.html`), or nil (→ 404).
    func url(for path: String) -> URL?
}

/// Production source: the files under a directory — `www/` in the app bundle by default.
public struct DirectoryStaticAssets: StaticAssets {
    private let root: URL

    public init(root: URL) {
        self.root = root
    }

    /// `www/` inside `bundle`, or nil when the bundle has no such directory.
    public init?(bundle: Bundle = .main, directory: String = "www") {
        guard let root = bundle.resourceURL?.appendingPathComponent(directory, isDirectory: true) else {
            return nil
        }
        self.init(root: root)
    }

    public func url(for path: String) -> URL? {
        let url = root.appendingPathComponent(path)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
              !isDirectory.boolValue
        else { return nil }
        return url
    }
}
