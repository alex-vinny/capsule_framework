// Docs: docs/guide/ai.md
//
//  AppleFoundationModelsProvider.swift
//  Capsule iOS
//
//  Tier 1 on iOS: Apple Foundation Models (the on-device Apple Intelligence model, iOS 26+).
//  Only Apple-Intelligence devices have it (iPhone 15 Pro+ / 16+, M1+ iPad/Mac; adr-003
//  "device-coverage cliff"); everywhere else `availability()` says why.
//
//  UNVERIFIED: the FoundationModels SDK does not exist on Linux, so the Docker test suite never
//  compiles this file. It is written against the iOS 26 SDK API and must be checked with Xcode /
//  xtool on macOS (CI macOS job) before it ships.
//

#if canImport(FoundationModels)
import Foundation
import FoundationModels

@available(iOS 26.0, macOS 26.0, *)
public final class AppleFoundationModelsProvider: AiProvider {
    private let model: SystemLanguageModel

    public init(model: SystemLanguageModel = .default) {
        self.model = model
    }

    public func availability() async -> AiAvailability {
        switch model.availability {
        case .available:
            return AiAvailability(tier: .osNative, status: .ready)
        case .unavailable(.modelNotReady):
            return AiAvailability(tier: .osNative, status: .downloading,
                                  reason: "The Apple Intelligence model is still downloading")
        case .unavailable(.appleIntelligenceNotEnabled):
            return unavailable("Apple Intelligence is turned off in Settings")
        case .unavailable(.deviceNotEligible):
            return unavailable("This device does not support Apple Intelligence")
        case .unavailable(let other):
            return unavailable("Apple Foundation Models unavailable: \(other)")
        }
    }

    /// The OS downloads the model on its own schedule; there is nothing an app can trigger.
    public func prepare() async -> AiAvailability {
        await availability()
    }

    public func generate(_ request: AiRequest) async throws -> AiResult {
        try await requireReady()
        do {
            let response = try await LanguageModelSession().respond(to: request.prompt, options: options(for: request))
            return AiResult(text: response.content, finishReason: .stop)
        } catch {
            throw AiError.generationFailed("\(error)")
        }
    }

    /// The SDK streams snapshots of the reply so far; this hands on only the new text of each.
    public func stream(_ request: AiRequest, onChunk: @escaping (String) -> Void) async throws -> AiResult {
        try await requireReady()
        var text = ""
        do {
            for try await snapshot in LanguageModelSession().streamResponse(to: request.prompt, options: options(for: request)) {
                let current = snapshot.content
                guard current.hasPrefix(text), current.count > text.count else {
                    text = current
                    continue
                }
                onChunk(String(current.dropFirst(text.count)))
                text = current
            }
        } catch {
            throw AiError.generationFailed("\(error)")
        }
        return AiResult(text: text, finishReason: .stop)
    }

    private func requireReady() async throws {
        let current = await availability()
        guard current.status == .ready else { throw AiError.unavailable(reason: current.reason) }
    }

    private func options(for request: AiRequest) -> GenerationOptions {
        GenerationOptions(temperature: request.temperature, maximumResponseTokens: request.maxTokens)
    }

    private func unavailable(_ reason: String) -> AiAvailability {
        AiAvailability(tier: .osNative, status: .unavailable, reason: reason)
    }
}
#endif
