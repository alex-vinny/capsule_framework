package dev.capsule.fakes

import dev.capsule.ai.AiAvailability
import dev.capsule.ai.AiFinishReason
import dev.capsule.ai.AiProvider
import dev.capsule.ai.AiRequest
import dev.capsule.ai.AiResult
import dev.capsule.ai.AiStatus
import dev.capsule.ai.AiTier
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError

/**
 * Scripted [AiProvider]: a fixed availability and a scripted reply, streamed as [chunks].
 * Records every request so tests can assert what reached the model.
 */
class FakeAiProvider(
    var availability: AiAvailability = AiAvailability(AiTier.OS_NATIVE, AiStatus.READY),
    var chunks: List<String> = listOf("Hello", ", ", "world"),
    var finishReason: AiFinishReason = AiFinishReason.STOP,
    /** What [availability] becomes once [prepare] runs (null = unchanged). */
    var afterPrepare: AiAvailability? = null,
) : AiProvider {
    val requests = mutableListOf<AiRequest>()
    var prepareCalls = 0

    override suspend fun availability() = availability

    override suspend fun prepare(): AiAvailability {
        prepareCalls++
        afterPrepare?.let { availability = it }
        return availability
    }

    override suspend fun generate(request: AiRequest): AiResult {
        requireReady()
        requests += request
        return AiResult(chunks.joinToString(""), finishReason)
    }

    override suspend fun stream(request: AiRequest, onChunk: (String) -> Unit): AiResult {
        requireReady()
        requests += request
        chunks.forEach(onChunk)
        return AiResult(chunks.joinToString(""), finishReason)
    }

    private fun requireReady() {
        if (availability.status != AiStatus.READY) throw CapsuleException(BridgeError.AiUnavailable, availability.reason)
    }
}
