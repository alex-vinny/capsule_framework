// Docs: docs/guide/ai.md
package dev.capsule.ai

/**
 * A tier this shell does not provide — today Tier 2 (bundled) and Tier 3 (cloud), which land
 * with Phase 6 (adr-003). It still answers [availability] with an honest [reason], so
 * `ai.availability()` can say *why* a tier is missing instead of just "unavailable".
 */
class UnavailableAiProvider(tier: AiTier, private val reason: String) : AiProvider {
    private val availability = AiAvailability(tier, AiStatus.UNAVAILABLE, reason)

    override suspend fun availability() = availability

    override suspend fun prepare() = availability

    override suspend fun generate(request: AiRequest): AiResult = throw aiUnavailable(reason)

    override suspend fun stream(request: AiRequest, onChunk: (String) -> Unit): AiResult =
        throw aiUnavailable(reason)
}
