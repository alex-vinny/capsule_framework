// Docs: docs/guide/ai.md
package dev.capsule.ai

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Candidate
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

/**
 * Tier 1 on Android: Gemini Nano through AICore, via ML Kit's GenAI Prompt API
 * (`com.google.mlkit:genai-prompt`, beta — https://developers.google.com/ml-kit/genai/prompt/android).
 *
 * Only devices with AICore and a Gemini Nano build have it (Pixel 8+, Galaxy S24+, …; see the
 * adr-003 "device-coverage cliff"). Everywhere else [availability] reports UNAVAILABLE and
 * [TieredAiProvider] moves on. The client is created lazily, so constructing this provider on a
 * device without AICore costs nothing and cannot throw.
 */
class AndroidGeminiNanoProvider(
    clientFactory: () -> GenerativeModel = { Generation.getClient() },
) : AiProvider {

    private val model by lazy(clientFactory)

    override suspend fun availability(): AiAvailability {
        val status = try {
            model.checkStatus()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return unavailable("Gemini Nano status check failed: ${e.message}")
        }
        return when (status) {
            FeatureStatus.AVAILABLE -> AiAvailability(AiTier.OS_NATIVE, AiStatus.READY)
            FeatureStatus.DOWNLOADABLE ->
                AiAvailability(AiTier.OS_NATIVE, AiStatus.DOWNLOADABLE, "Gemini Nano must be downloaded first — call ai.prepare()")
            FeatureStatus.DOWNLOADING ->
                AiAvailability(AiTier.OS_NATIVE, AiStatus.DOWNLOADING, "Gemini Nano is downloading — call ai.prepare() to wait for it")
            else -> unavailable("Gemini Nano (AICore) is not available on this device")
        }
    }

    override suspend fun prepare(): AiAvailability {
        val current = availability()
        if (current.status != AiStatus.DOWNLOADABLE && current.status != AiStatus.DOWNLOADING) return current
        val outcome = try {
            model.download().first { it is DownloadStatus.DownloadCompleted || it is DownloadStatus.DownloadFailed }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return unavailable("Gemini Nano download failed: ${e.message}")
        }
        if (outcome is DownloadStatus.DownloadFailed) return unavailable("Gemini Nano download failed: ${outcome.e.message}")
        return availability()
    }

    override suspend fun generate(request: AiRequest): AiResult {
        requireReady()
        val response = generation { model.generateContent(request.toMlKit()) }
        val candidate = response.candidates.firstOrNull()
            ?: throw CapsuleException(BridgeError.AiGenerationFailed, "Gemini Nano returned no candidates")
        return AiResult(candidate.text.orEmpty(), finishReason(candidate.finishReason))
    }

    // Each streamed response carries the next piece of text (not the text so far); the last one
    // carries the finish reason.
    override suspend fun stream(request: AiRequest, onChunk: (String) -> Unit): AiResult {
        requireReady()
        val text = StringBuilder()
        var finish: Int? = null
        generation {
            model.generateContentStream(request.toMlKit()).collect { response ->
                val candidate = response.candidates.firstOrNull() ?: return@collect
                val piece = candidate.text.orEmpty()
                if (piece.isNotEmpty()) {
                    text.append(piece)
                    onChunk(piece)
                }
                candidate.finishReason?.let { finish = it }
            }
        }
        return AiResult(text.toString(), finishReason(finish))
    }

    private suspend fun requireReady() {
        val availability = availability()
        if (availability.status != AiStatus.READY) throw aiUnavailable(availability.reason)
    }

    /** Model errors become AI_GENERATION_FAILED; cancellation and our own errors pass through. */
    private suspend fun <T> generation(block: suspend () -> T): T = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: CapsuleException) {
        throw e
    } catch (e: Exception) {
        throw CapsuleException(BridgeError.AiGenerationFailed, e.message)
    }

    private fun unavailable(reason: String) = AiAvailability(AiTier.OS_NATIVE, AiStatus.UNAVAILABLE, reason)

    private fun finishReason(reason: Int?): AiFinishReason = when (reason) {
        null, Candidate.FinishReason.STOP -> AiFinishReason.STOP
        Candidate.FinishReason.MAX_TOKENS -> AiFinishReason.LENGTH
        else -> AiFinishReason.OTHER
    }
}

private fun AiRequest.toMlKit(): GenerateContentRequest {
    val request = this
    return GenerateContentRequest.Builder(TextPart(prompt)).apply {
        maxOutputTokens = request.maxTokens
        temperature = request.temperature
    }.build()
}
