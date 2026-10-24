// Docs: docs/guide/ai.md
package dev.capsule.handlers.ai

import dev.capsule.ai.AiProvider
import dev.capsule.ai.AiRequest
import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.handlers.optDouble
import dev.capsule.handlers.optInt
import dev.capsule.handlers.optString
import dev.capsule.protocol.BridgeError
import dev.capsule.protocol.BridgeEventEmitter
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

/** Bridge method names — mirror `AiMethods` in `@capsule/core`. */
object AiMethods {
    const val AVAILABILITY = "ai.availability"
    const val PREPARE = "ai.prepare"
    const val GENERATE = "ai.generate"
    const val STREAM = "ai.stream"
    /** Notification (native → JS): one piece of a streaming reply. */
    const val STREAM_CHUNK = "ai.streamChunk"
}

@Serializable data class AiStreamChunk(val streamId: String, val text: String)

// ─── Handlers ────────────────────────────────────────────────────────────────

class AiAvailabilityHandler(private val provider: AiProvider) : BridgeHandler {
    override val method = AiMethods.AVAILABILITY
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(provider.availability())
}

class AiPrepareHandler(private val provider: AiProvider) : BridgeHandler {
    override val method = AiMethods.PREPARE
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(provider.prepare())
}

class AiGenerateHandler(private val provider: AiProvider) : BridgeHandler {
    override val method = AiMethods.GENERATE
    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(provider.generate(params.jsonObject.toAiRequest()))
}

/**
 * `ai.stream` → pushes each piece of the reply as an `ai.streamChunk` notification tagged with
 * the caller's `streamId`, then answers with the complete result (same shape as `ai.generate`),
 * which tells the JS side the stream has ended.
 */
class AiStreamHandler(
    private val provider: AiProvider,
    private val emitter: BridgeEventEmitter,
) : BridgeHandler {
    override val method = AiMethods.STREAM
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        val streamId = o.optString("streamId") ?: throw CapsuleException(BridgeError.ParseError, "streamId required")
        val result = provider.stream(o.toAiRequest()) { text ->
            emitter.emit(AiMethods.STREAM_CHUNK, Json.encodeToJsonElement(AiStreamChunk(streamId, text)))
        }
        return Json.encodeToJsonElement(result)
    }
}

private fun JsonObject.toAiRequest(): AiRequest {
    val prompt = optString("prompt")?.takeIf { it.isNotBlank() }
        ?: throw CapsuleException(BridgeError.ParseError, "prompt required")
    return AiRequest(prompt, optInt("maxTokens"), optDouble("temperature")?.toFloat())
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun aiHandlers(provider: AiProvider, emitter: BridgeEventEmitter): List<BridgeHandler> = listOf(
    AiAvailabilityHandler(provider),
    AiPrepareHandler(provider),
    AiGenerateHandler(provider),
    AiStreamHandler(provider, emitter),
)
