// Docs: docs/guide/ai.md
package dev.capsule.ai

import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One inference backend behind the `ai` capability (`docs/decisions/0003-ai-and-agents.md`).
 * Three tiers implement it — OS-native (Gemini Nano via AICore), bundled (Cactus / llama.cpp,
 * Phase 6) and cloud (Capsule OTA cloud, Phase 6) — and [TieredAiProvider] dispatches across
 * them, so the handlers and `@capsule/core` see one surface. The iOS shell implements the same
 * contract (Apple Foundation Models for Tier 1).
 *
 * Persistence rule (Phase-3 OTA constraint): Tier-1 models are owned by the OS, so nothing is
 * stored here; Tier-2 model files must live outside the OTA-swappable bundle dirs.
 */
interface AiProvider {
    /** Whether this provider can generate right now. Never throws. */
    suspend fun availability(): AiAvailability

    /**
     * Makes the provider ready when it can be (e.g. downloads the OS model), then reports the
     * resulting availability. Returns at once when there is nothing to prepare.
     */
    suspend fun prepare(): AiAvailability

    /** A complete reply. Throws [CapsuleException] `AI_UNAVAILABLE` when not [AiStatus.READY]. */
    suspend fun generate(request: AiRequest): AiResult

    /** Like [generate], calling [onChunk] with each piece of text as the model produces it. */
    suspend fun stream(request: AiRequest, onChunk: (String) -> Unit): AiResult

    companion object {
        /** Capability name + native version for OTA gating (see CapabilityRegistry). */
        const val CAPABILITY = "ai"
        const val CAPABILITY_VERSION = 1
    }
}

/** Which kind of backend serves (or would serve) a request. Wire form mirrors `@capsule/core`. */
@Serializable
enum class AiTier {
    @SerialName("os-native") OS_NATIVE,
    @SerialName("bundled") BUNDLED,
    @SerialName("cloud") CLOUD,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
enum class AiStatus {
    /** Can generate now. */
    @SerialName("ready") READY,
    /** Supported, but the model must be downloaded first — `ai.prepare()`. */
    @SerialName("downloadable") DOWNLOADABLE,
    /** The model is downloading. */
    @SerialName("downloading") DOWNLOADING,
    /** Not supported on this device or shell build. */
    @SerialName("unavailable") UNAVAILABLE,
}

/** The honest answer to "can this app use AI here?" — [reason] explains anything but READY. */
@Serializable
data class AiAvailability(
    val tier: AiTier,
    val status: AiStatus,
    val reason: String? = null,
)

data class AiRequest(
    val prompt: String,
    val maxTokens: Int? = null,
    val temperature: Float? = null,
)

@Serializable
enum class AiFinishReason {
    /** The model reached a natural end. */
    @SerialName("stop") STOP,
    /** `maxTokens` cut the reply short. */
    @SerialName("length") LENGTH,
    @SerialName("other") OTHER,
}

@Serializable
data class AiResult(val text: String, val finishReason: AiFinishReason)

internal fun aiUnavailable(reason: String?) = CapsuleException(BridgeError.AiUnavailable, reason)

/** Wire name of a tier (`os-native`, …) for human-readable reasons. */
internal val AiTier.wireName: String get() = name.lowercase().replace('_', '-')
