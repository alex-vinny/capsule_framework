// Docs: docs/guide/ai.md
package dev.capsule.ai

/**
 * Dispatches across tiers in preference order — the order *is* the policy (adr-003 "hybrid":
 * on-device first, cloud last). The first [AiStatus.READY] provider serves every request.
 * When none is ready, the most promising one (downloadable / downloading beats unavailable) is
 * what [availability] reports and what [prepare] prepares.
 */
class TieredAiProvider(private val providers: List<AiProvider>) : AiProvider {

    init {
        require(providers.isNotEmpty()) { "TieredAiProvider needs at least one provider" }
    }

    override suspend fun availability(): AiAvailability = choose().availability

    override suspend fun prepare(): AiAvailability {
        val choice = choose()
        val provider = choice.provider ?: return choice.availability
        return if (choice.availability.status == AiStatus.READY) choice.availability else provider.prepare()
    }

    override suspend fun generate(request: AiRequest): AiResult = ready().generate(request)

    override suspend fun stream(request: AiRequest, onChunk: (String) -> Unit): AiResult =
        ready().stream(request, onChunk)

    private suspend fun ready(): AiProvider {
        val choice = choose()
        if (choice.provider == null || choice.availability.status != AiStatus.READY) {
            throw aiUnavailable(choice.availability.reason)
        }
        return choice.provider
    }

    private class Choice(val provider: AiProvider?, val availability: AiAvailability)

    /** First READY provider; else the first that can become ready; else none, with every reason. */
    private suspend fun choose(): Choice {
        val all = providers.map { Choice(it, it.availability()) }
        all.firstOrNull { it.availability.status == AiStatus.READY }?.let { return it }
        all.firstOrNull {
            it.availability.status == AiStatus.DOWNLOADABLE || it.availability.status == AiStatus.DOWNLOADING
        }?.let { return it }
        val reason = all.joinToString("; ") { "${it.availability.tier.wireName}: ${it.availability.reason ?: "unavailable"}" }
        return Choice(null, AiAvailability(AiTier.UNAVAILABLE, AiStatus.UNAVAILABLE, reason))
    }
}
