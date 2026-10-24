// Docs: docs/contributing/ios-bring-up.md
//
//  CapsuleShellConfig.swift
//  Capsule iOS
//
//  Port of dev.capsule.CapsuleShellConfig (Android) + the CodeSync opt-in.
//

import Foundation

/// Configuration for the CodeSync (OTA) client. Self-contained — the shell opts in by
/// setting `CapsuleShellConfig.codeSync`; when nil, the feature is absent from the
/// bridge surface.
public struct CodeSyncConfig {
    /// Base URL of the CodeSync backend, e.g. "https://codesync.example.com".
    public let url: String
    /// Reverse-DNS app identifier matching the CodeSync app registration.
    public let appId: String
    /// Deployment channel: "production", "staging", …
    public let channel: String
    /// The installed shell (native) version, e.g. "1.4.0" — gates which bundles apply.
    public let nativeVersion: String

    public init(url: String, appId: String, channel: String = "production", nativeVersion: String) {
        self.url = url
        self.appId = appId
        self.channel = channel
        self.nativeVersion = nativeVersion
    }
}

public struct CapsuleShellConfig {
    /// Reverse-DNS app identifier. Used to derive the embedded server port, so it must differ
    /// between apps on one device — `init` defaults it to the app's bundle identifier.
    public let appId: String
    /// When non-nil, the WebView loads from this URL (dev mode). Overrides the embedded server.
    public let devServerURL: String?
    /// How long (ms) to wait for the embedded server to bind before showing the error screen.
    public let serverTimeoutMs: Int64
    /// OTA (CodeSync) configuration; nil = feature disabled.
    public let codeSync: CodeSyncConfig?

    public init(
        appId: String? = nil,
        devServerURL: String? = nil,
        serverTimeoutMs: Int64 = 3_000,
        codeSync: CodeSyncConfig? = nil
    ) {
        // A shared constant would give every Capsule app the same port — the second to start
        // would find it taken.
        self.appId = appId ?? Bundle.main.bundleIdentifier ?? "dev.capsule.app"
        self.devServerURL = devServerURL
        self.serverTimeoutMs = serverTimeoutMs
        self.codeSync = codeSync
    }
}
