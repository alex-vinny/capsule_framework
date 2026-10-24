// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncManager.swift
//  Capsule iOS
//
//  Port of dev.capsule.codesync.CodeSyncManager (Android) — manages over-the-air (OTA)
//  updates for the Capsule iOS shell.
//
//  Orchestrates: update check (CDN-cacheable GET) -> client-side rollout decision ->
//  bundle download -> SHA-256 verification -> extraction -> install via BundleStore's
//  atomic two-slot swap. Every side-effecting dependency is injected
//  (CodeSyncHTTPClient, CodeSyncPreferences, BundleStore) so the full flow is
//  unit-testable with fakes.
//
//  API is async-first; like the Android manager it never throws — failures come back
//  as UpdateResult.error.
//

import Foundation
import Crypto

public final class CodeSyncManager {
    private let config: CodeSyncConfig
    private let httpClient: CodeSyncHTTPClient
    private let preferences: CodeSyncPreferences
    private let bundleStore: BundleStore
    private let bundlesRoot: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    /// Last lifecycle status — mirrors the JS CodeSyncStatus strings exactly.
    public private(set) var lastStatus: String = CodeSyncStatus.idle

    /// Bundle staged by the latest successful check — reported by the bridge until applied.
    public private(set) var pendingUpdate: BundleInfo?

    public init(
        config: CodeSyncConfig,
        httpClient: CodeSyncHTTPClient,
        preferences: CodeSyncPreferences,
        bundleStore: BundleStore,
        bundlesRoot: URL
    ) {
        self.config = config
        self.httpClient = httpClient
        self.preferences = preferences
        self.bundleStore = bundleStore
        self.bundlesRoot = bundlesRoot
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    // MARK: - URLs (codesync-internals.md shapes)

    /// CDN-cacheable check URL — no device-specific headers.
    func checkURL() -> String {
        config.url.trimmedTrailingSlash()
            + "/v1/check/\(config.appId)/\(config.channel)/\(config.nativeVersion)"
    }

    func checkinURL() -> String {
        config.url.trimmedTrailingSlash() + "/v1/devices/checkin"
    }

    // MARK: - Flow

    /// Checks for an available OTA update, downloads and installs it when in rollout and
    /// newer than the installed build. Never throws.
    public func checkForUpdate() async -> UpdateResult {
        lastStatus = CodeSyncStatus.checking
        let currentBuildNumber = preferences.currentBuildNumber()

        let responseBody: Data
        do {
            let response = try await httpClient.get(checkURL())
            guard response.code == 200 else {
                return fail("HTTP \(response.code) from check endpoint")
            }
            responseBody = response.body
        } catch {
            return fail("Network error: \(error.localizedDescription)")
        }

        let check: CheckResponse
        do {
            check = try decoder.decode(CheckResponse.self, from: responseBody)
        } catch {
            return fail("Failed to parse check response: \(error.localizedDescription)")
        }

        // Fire-and-forget telemetry — awaited (not detached) so tests stay deterministic;
        // failures are swallowed by design.
        await reportCheckin(bundleId: check.bundle.id)

        // Client-side rollout decision — deterministic, no extra server round-trip.
        let inRollout = Rollout.isInRollout(
            deviceId: preferences.deviceId(), percent: check.bundle.rolloutPercent)
        guard inRollout, check.bundle.buildNumber > currentBuildNumber else {
            lastStatus = CodeSyncStatus.idle
            return .upToDate
        }

        return await downloadAndInstall(check.bundle)
    }

    private func downloadAndInstall(_ bundle: BundleInfo) async -> UpdateResult {
        lastStatus = CodeSyncStatus.downloading
        let bundleDir = bundlesRoot.appendingPathComponent(bundle.id, isDirectory: true)

        let zipBytes: Data
        do {
            let response = try await httpClient.get(bundle.url)
            guard response.code == 200 else {
                return fail("Download failed: HTTP \(response.code)", bundleDir: bundleDir)
            }
            zipBytes = response.body
        } catch {
            return fail("Download failed: \(error.localizedDescription)", bundleDir: bundleDir)
        }

        // Integrity gate — reject + report on any mismatch (040-CodeSync security section).
        let digest = SHA256.hash(data: zipBytes)
        let computedHash = digest.map { String(format: "%02x", $0) }.joined()
        guard computedHash.lowercased() == bundle.sha256Hex.lowercased() else {
            return fail("Hash verification failed", bundleDir: bundleDir)
        }

        let zipURL = bundleDir.appendingPathComponent("bundle.zip")
        do {
            try FileManager.default.createDirectory(
                at: bundleDir, withIntermediateDirectories: true)
            try zipBytes.write(to: zipURL)
        } catch {
            return fail("Failed to write bundle: \(error.localizedDescription)", bundleDir: bundleDir)
        }

        lastStatus = CodeSyncStatus.applying
        guard CodeSyncUnzipper.unzip(zipURL: zipURL, targetDir: bundleDir) else {
            return fail("Failed to extract bundle", bundleDir: bundleDir)
        }
        try? FileManager.default.removeItem(at: zipURL)

        let wwwIndex = bundleDir.appendingPathComponent("www/index.html")
        guard FileManager.default.fileExists(atPath: wwwIndex.path) else {
            return fail("Invalid bundle: missing www/index.html", bundleDir: bundleDir)
        }

        do {
            // Atomic swap: current active -> previous, staged -> active (BundleStore contract).
            try bundleStore.install(staged: bundleDir)
        } catch {
            return fail("Failed to install bundle: \(error.localizedDescription)", bundleDir: bundleDir)
        }

        preferences.setCurrentBundle(
            buildNumber: bundle.buildNumber, bundleId: bundle.id, bundlePath: bundleDir.path)
        pendingUpdate = bundle
        lastStatus = CodeSyncStatus.downloadReady
        return .updateReady(bundlePath: bundleDir.path)
    }

    /// Fire-and-forget device telemetry; failures are swallowed by design.
    private func reportCheckin(bundleId: String) async {
        let checkin = DeviceCheckin(
            deviceId: preferences.deviceId(),
            appId: config.appId,
            platform: "ios",
            nativeVersion: config.nativeVersion,
            bundleId: bundleId,
            channel: config.channel
        )
        guard let body = try? encoder.encode(checkin) else { return }
        _ = try? await httpClient.postJSON(checkinURL(), jsonBody: body)
    }

    private func fail(_ message: String, bundleDir: URL? = nil) -> UpdateResult {
        if let bundleDir {
            try? FileManager.default.removeItem(at: bundleDir)
        }
        lastStatus = CodeSyncStatus.error
        return .error(message)
    }
}

private extension String {
    func trimmedTrailingSlash() -> String {
        hasSuffix("/") ? String(dropLast()) : self
    }
}
