// Docs: docs/guide/ai.md
//
//  TieredAiProviderTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.ai.TieredAiProviderTest (Android) — same cases, same expectations.
//

import XCTest
@testable import Capsule

final class TieredAiProviderTests: XCTestCase {

    private let bundled = UnavailableAiProvider(tier: .bundled, reason: "Bundled models land in Phase 6")
    private let cloud = UnavailableAiProvider(tier: .cloud, reason: "Cloud inference lands in Phase 6")

    private func osNative(_ status: AiStatus, _ reason: String? = nil) -> FakeAiProvider {
        FakeAiProvider(AiAvailability(tier: .osNative, status: status, reason: reason))
    }

    func testTheFirstReadyTierServes() async throws {
        let cloudReady = FakeAiProvider(AiAvailability(tier: .cloud, status: .ready), chunks: ["from cloud"])
        let ai = TieredAiProvider([osNative(.unavailable, "no model"), bundled, cloudReady])

        let availability = await ai.availability()
        XCTAssertEqual(availability, AiAvailability(tier: .cloud, status: .ready))
        let result = try await ai.generate(AiRequest(prompt: "hi"))
        XCTAssertEqual(result.text, "from cloud")
    }

    func testAnEarlierReadyTierWinsOverALaterOne() async throws {
        let first = osNative(.ready)
        let second = FakeAiProvider(AiAvailability(tier: .cloud, status: .ready))

        _ = try await TieredAiProvider([first, second]).generate(AiRequest(prompt: "hi"))

        XCTAssertEqual(first.requests.count, 1)
        XCTAssertEqual(second.requests.count, 0)
    }

    func testADownloadableTierIsReportedOverUnavailableOnes() async {
        let ai = TieredAiProvider([osNative(.downloadable, "call ai.prepare()"), bundled, cloud])

        let availability = await ai.availability()
        XCTAssertEqual(availability, AiAvailability(tier: .osNative, status: .downloadable, reason: "call ai.prepare()"))
    }

    func testPrepareReadiesTheMostPromisingTier() async throws {
        let nano = osNative(.downloadable)
        nano.afterPrepare = AiAvailability(tier: .osNative, status: .ready)
        let ai = TieredAiProvider([nano, bundled, cloud])

        let prepared = await ai.prepare()
        XCTAssertEqual(prepared.status, .ready)
        XCTAssertEqual(nano.prepareCalls, 1)
        let result = try await ai.generate(AiRequest(prompt: "hi"))
        XCTAssertEqual(result.text, "Hello, world")
    }

    func testPrepareDoesNothingWhenATierIsAlreadyReady() async {
        let nano = osNative(.ready)

        _ = await TieredAiProvider([nano]).prepare()

        XCTAssertEqual(nano.prepareCalls, 0)
    }

    func testWithNoUsableTierAvailabilityListsEveryReason() async {
        let ai = TieredAiProvider([osNative(.unavailable, "no model"), bundled, cloud])

        let availability = await ai.availability()

        XCTAssertEqual(availability.tier, .unavailable)
        XCTAssertEqual(availability.status, .unavailable)
        XCTAssertEqual(
            availability.reason,
            "os-native: no model; bundled: Bundled models land in Phase 6; cloud: Cloud inference lands in Phase 6"
        )
    }

    func testGeneratingWithoutAReadyTierFailsWithTheReason() async {
        let ai = TieredAiProvider([osNative(.downloadable, "call ai.prepare()"), cloud])
        do {
            _ = try await ai.generate(AiRequest(prompt: "hi"))
            XCTFail("expected AiError.unavailable")
        } catch {
            XCTAssertEqual(error as? AiError, .unavailable(reason: "call ai.prepare()"))
        }
    }

    func testStreamPassesTheReadyTiersChunksThrough() async throws {
        let collected = Recorder()

        let result = try await TieredAiProvider([bundled, osNative(.ready)])
            .stream(AiRequest(prompt: "hi")) { collected.values.append($0) }

        XCTAssertEqual(collected.values, ["Hello", ", ", "world"])
        XCTAssertEqual(result.text, "Hello, world")
    }

    func testAnUnavailableProviderNeverGenerates() async {
        do {
            _ = try await bundled.generate(AiRequest(prompt: "hi"))
            XCTFail("expected AiError.unavailable")
        } catch {
            XCTAssertEqual(error as? AiError, .unavailable(reason: "Bundled models land in Phase 6"))
        }
    }

    func testAvailabilityEncodesToTheWireForm() throws {
        let json = try JSONEncoder().encode(AiAvailability(tier: .osNative, status: .downloadable))
        let decoded = try JSONSerialization.jsonObject(with: json) as? [String: String]
        XCTAssertEqual(decoded, ["tier": "os-native", "status": "downloadable"])
    }

    func testTheStandardTierOrderIsHonestOnLinux() async {
        // No FoundationModels SDK here → every tier reports itself unavailable, with a reason.
        let availability = await TieredAiProvider.standard().availability()

        #if !canImport(FoundationModels)
        XCTAssertEqual(availability.status, .unavailable)
        XCTAssertTrue(availability.reason?.contains("os-native:") == true)
        #endif
    }
}
