// Docs: docs/contributing/codesync-internals.md
//
//  CodeSyncModels.swift
//  Capsule iOS
//
//  Wire types for the CodeSync endpoints — mirror `@capsule/core` and the Android
//  `codesync/CodeSyncModels.kt` exactly. The wire JSON is the cross-platform contract
//  (Android + iOS + server decode the same shapes).
//

import Foundation

/// Response of `GET /v1/check/{appId}/{channel}/{nativeVersion}` (codesync-internals.md).
public struct CheckResponse: Decodable {
    public let latestBuildNumber: Int64
    public let bundle: BundleInfo
}

public struct BundleInfo: Decodable {
    public let id: String
    public let url: String
    /// Server sends `"hash": "sha256:<hex>"`; `sha256Hex` exposes the bare hex.
    public let hash: String
    public let sizeBytes: Int64
    public let version: String
    public let buildNumber: Int64
    public let rolloutPercent: Int
    public let mandatory: Bool

    private enum CodingKeys: String, CodingKey {
        case id, url, hash, sizeBytes, version, buildNumber, rolloutPercent, mandatory
    }

    public init(
        id: String, url: String, hash: String, sizeBytes: Int64, version: String,
        buildNumber: Int64, rolloutPercent: Int = 100, mandatory: Bool = false
    ) {
        self.id = id
        self.url = url
        self.hash = hash
        self.sizeBytes = sizeBytes
        self.version = version
        self.buildNumber = buildNumber
        self.rolloutPercent = rolloutPercent
        self.mandatory = mandatory
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        url = try c.decode(String.self, forKey: .url)
        hash = try c.decode(String.self, forKey: .hash)
        sizeBytes = try c.decode(Int64.self, forKey: .sizeBytes)
        version = try c.decode(String.self, forKey: .version)
        buildNumber = try c.decode(Int64.self, forKey: .buildNumber)
        rolloutPercent = try c.decodeIfPresent(Int.self, forKey: .rolloutPercent) ?? 100
        mandatory = try c.decodeIfPresent(Bool.self, forKey: .mandatory) ?? false
    }

    /// Bare SHA-256 hex with the "sha256:" prefix (if present) stripped.
    public var sha256Hex: String {
        hash.hasPrefix("sha256:") ? String(hash.dropFirst("sha256:".count)) : hash
    }
}

// MARK: - Bridge DTOs (shapes consumed by `@capsule/core`'s CodeSyncModule)

/// Status strings MUST match the JS `CodeSyncStatus` union exactly (note the spaces).
public enum CodeSyncStatus {
    public static let idle = "idle"
    public static let checking = "checking"
    public static let downloadReady = "download ready"
    public static let downloading = "downloading"
    public static let downloadFailed = "download failed"
    public static let applying = "applying"
    public static let updateApplied = "update applied"
    public static let error = "error"
}

public struct CodeSyncUpdateDTO: Encodable {
    public let version: String
    public let buildNumber: Int64
    public let notes: String?
    public let mandatory: Bool
    public let rolloutPercent: Int

    public init(
        version: String, buildNumber: Int64, notes: String? = nil,
        mandatory: Bool = false, rolloutPercent: Int = 100
    ) {
        self.version = version
        self.buildNumber = buildNumber
        self.notes = notes
        self.mandatory = mandatory
        self.rolloutPercent = rolloutPercent
    }
}

/// Response body for `codesync.checkForUpdate` / `codesync.getStatus`.
public struct CodeSyncCheckResultDTO: Encodable {
    public let status: String
    public let update: CodeSyncUpdateDTO?
}

/// Body of the fire-and-forget device check-in POST (`/v1/devices/checkin`).
public struct DeviceCheckin: Encodable {
    public let deviceId: String
    public let appId: String
    public let platform: String
    public let nativeVersion: String
    public let bundleId: String?
    public let channel: String
}

// MARK: - Update result

/// Result of an OTA update check — mirrors Android's sealed class.
public enum UpdateResult: Equatable {
    case upToDate
    case updateReady(bundlePath: String)
    case error(String)
}
