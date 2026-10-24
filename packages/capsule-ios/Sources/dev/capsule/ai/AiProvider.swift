// Docs: docs/guide/ai.md
//
//  AiProvider.swift
//  Capsule iOS
//
//  The `ai` capability (adr-003) — mirrors Android's dev.capsule.ai package type for type, so
//  `ai.availability()` / `ai.generate()` answer the same on both platforms. Tier 1 on iOS is
//  Apple Foundation Models (AppleFoundationModelsProvider); Tiers 2 (bundled) and 3 (cloud)
//  land with Phase 6. Bridge wiring arrives with the Phase-4 CapsuleBridge.
//

import Foundation

/// Capability name + native version for OTA gating (mirrors Android's `AiProvider.CAPABILITY`).
public enum AiCapability {
    public static let name = "ai"
    public static let version = 1
}

/// Which kind of backend serves (or would serve) a request. Raw values are the wire form.
public enum AiTier: String, Codable, Equatable {
    case osNative = "os-native"
    case bundled
    case cloud
    case unavailable
}

public enum AiStatus: String, Codable, Equatable {
    /// Can generate now.
    case ready
    /// Supported, but the model must be downloaded first — `ai.prepare()`.
    case downloadable
    /// The model is downloading.
    case downloading
    /// Not supported on this device or shell build.
    case unavailable
}

/// The honest answer to "can this app use AI here?" — `reason` explains anything but `.ready`.
public struct AiAvailability: Codable, Equatable {
    public let tier: AiTier
    public let status: AiStatus
    public let reason: String?

    public init(tier: AiTier, status: AiStatus, reason: String? = nil) {
        self.tier = tier
        self.status = status
        self.reason = reason
    }
}

public struct AiRequest: Equatable {
    public let prompt: String
    public let maxTokens: Int?
    public let temperature: Double?

    public init(prompt: String, maxTokens: Int? = nil, temperature: Double? = nil) {
        self.prompt = prompt
        self.maxTokens = maxTokens
        self.temperature = temperature
    }
}

public enum AiFinishReason: String, Codable, Equatable {
    /// The model reached a natural end.
    case stop
    /// `maxTokens` cut the reply short.
    case length
    case other
}

public struct AiResult: Codable, Equatable {
    public let text: String
    public let finishReason: AiFinishReason

    public init(text: String, finishReason: AiFinishReason) {
        self.text = text
        self.finishReason = finishReason
    }
}

/// Maps to the bridge errors `AI_UNAVAILABLE` (7001) and `AI_GENERATION_FAILED` (7002).
public enum AiError: Error, Equatable {
    case unavailable(reason: String?)
    case generationFailed(String)
}

/// One inference backend. Tier-1 models are owned by the OS, so nothing is stored here; Tier-2
/// model files must live outside the OTA-swappable bundle dirs.
public protocol AiProvider: AnyObject {
    /// Whether this provider can generate right now. Never throws.
    func availability() async -> AiAvailability

    /// Makes the provider ready when it can be, then reports the resulting availability.
    func prepare() async -> AiAvailability

    /// A complete reply. Throws `AiError.unavailable` when not `.ready`.
    func generate(_ request: AiRequest) async throws -> AiResult

    /// Like `generate`, calling `onChunk` with each piece of text as the model produces it.
    func stream(_ request: AiRequest, onChunk: @escaping (String) -> Void) async throws -> AiResult
}

/// A tier this shell does not provide (today: bundled and cloud). Still answers `availability`
/// with an honest reason, so `ai.availability()` can say *why* a tier is missing.
public final class UnavailableAiProvider: AiProvider {
    private let current: AiAvailability

    public init(tier: AiTier, reason: String) {
        current = AiAvailability(tier: tier, status: .unavailable, reason: reason)
    }

    public func availability() async -> AiAvailability { current }

    public func prepare() async -> AiAvailability { current }

    public func generate(_ request: AiRequest) async throws -> AiResult {
        throw AiError.unavailable(reason: current.reason)
    }

    public func stream(_ request: AiRequest, onChunk: @escaping (String) -> Void) async throws -> AiResult {
        throw AiError.unavailable(reason: current.reason)
    }
}

/// Dispatches across tiers in preference order — the order *is* the policy (adr-003 "hybrid":
/// on-device first, cloud last). The first `.ready` provider serves every request; when none is
/// ready, the most promising one (downloadable / downloading beats unavailable) is what
/// `availability` reports and what `prepare` prepares. Mirrors Android's TieredAiProvider.
public final class TieredAiProvider: AiProvider {
    private let providers: [AiProvider]

    public init(_ providers: [AiProvider]) {
        precondition(!providers.isEmpty, "TieredAiProvider needs at least one provider")
        self.providers = providers
    }

    /// The default tier order for this shell build: Apple Foundation Models where the SDK has
    /// it, then the Phase-6 tiers, which report themselves unavailable.
    public static func standard() -> TieredAiProvider {
        TieredAiProvider([
            osNativeProvider(),
            UnavailableAiProvider(tier: .bundled, reason: "Bundled on-device models arrive in Phase 6 (adr-003)"),
            UnavailableAiProvider(tier: .cloud, reason: "Cloud inference arrives in Phase 6 (adr-003)"),
        ])
    }

    public func availability() async -> AiAvailability {
        await choose().availability
    }

    public func prepare() async -> AiAvailability {
        let choice = await choose()
        guard let provider = choice.provider, choice.availability.status != .ready else { return choice.availability }
        return await provider.prepare()
    }

    public func generate(_ request: AiRequest) async throws -> AiResult {
        try await ready().generate(request)
    }

    public func stream(_ request: AiRequest, onChunk: @escaping (String) -> Void) async throws -> AiResult {
        try await ready().stream(request, onChunk: onChunk)
    }

    private func ready() async throws -> AiProvider {
        let choice = await choose()
        guard let provider = choice.provider, choice.availability.status == .ready else {
            throw AiError.unavailable(reason: choice.availability.reason)
        }
        return provider
    }

    private struct Choice {
        let provider: AiProvider?
        let availability: AiAvailability
    }

    /// First ready provider; else the first that can become ready; else none, with every reason.
    private func choose() async -> Choice {
        var all: [Choice] = []
        for provider in providers {
            all.append(Choice(provider: provider, availability: await provider.availability()))
        }
        if let ready = all.first(where: { $0.availability.status == .ready }) { return ready }
        if let pending = all.first(where: { [.downloadable, .downloading].contains($0.availability.status) }) {
            return pending
        }
        let reason = all
            .map { "\($0.availability.tier.rawValue): \($0.availability.reason ?? "unavailable")" }
            .joined(separator: "; ")
        return Choice(provider: nil, availability: AiAvailability(tier: .unavailable, status: .unavailable, reason: reason))
    }

    private static func osNativeProvider() -> AiProvider {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, macOS 26.0, *) {
            return AppleFoundationModelsProvider()
        }
        return UnavailableAiProvider(tier: .osNative, reason: "Apple Foundation Models need iOS 26 or later")
        #else
        return UnavailableAiProvider(tier: .osNative, reason: "This build has no Apple Foundation Models SDK")
        #endif
    }
}
