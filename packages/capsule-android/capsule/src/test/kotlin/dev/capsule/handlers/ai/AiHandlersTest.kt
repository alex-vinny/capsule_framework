// Docs: docs/guide/ai.md
package dev.capsule.handlers.ai

import dev.capsule.ai.AiAvailability
import dev.capsule.ai.AiFinishReason
import dev.capsule.ai.AiRequest
import dev.capsule.ai.AiStatus
import dev.capsule.ai.AiTier
import dev.capsule.fakes.FakeAiProvider
import dev.capsule.fakes.FakeBridgeEventEmitter
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

class AiHandlersTest {

    private fun params(vararg pairs: Pair<String, Any>) = JsonObject(
        pairs.associate { (k, v) ->
            k to when (v) {
                is Number -> JsonPrimitive(v)
                else -> JsonPrimitive(v.toString())
            }
        },
    )

    @Test
    fun `availability reports tier and status in wire form`() = runTest {
        val provider = FakeAiProvider(AiAvailability(AiTier.OS_NATIVE, AiStatus.DOWNLOADABLE, "call ai.prepare()"))

        val result = AiAvailabilityHandler(provider).handle(JsonObject(emptyMap())).jsonObject

        assertEquals("os-native", result["tier"]!!.jsonPrimitive.content)
        assertEquals("downloadable", result["status"]!!.jsonPrimitive.content)
        assertEquals("call ai.prepare()", result["reason"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a ready availability omits the reason`() = runTest {
        val result = AiAvailabilityHandler(FakeAiProvider()).handle(JsonObject(emptyMap())).jsonObject

        assertEquals("ready", result["status"]!!.jsonPrimitive.content)
        assertFalse(result.containsKey("reason"))
    }

    @Test
    fun `prepare returns the availability after preparing`() = runTest {
        val provider = FakeAiProvider(
            availability = AiAvailability(AiTier.OS_NATIVE, AiStatus.DOWNLOADABLE),
            afterPrepare = AiAvailability(AiTier.OS_NATIVE, AiStatus.READY),
        )

        val result = AiPrepareHandler(provider).handle(JsonObject(emptyMap())).jsonObject

        assertEquals("ready", result["status"]!!.jsonPrimitive.content)
        assertEquals(1, provider.prepareCalls)
    }

    @Test
    fun `generate maps params to the request and returns text and finish reason`() = runTest {
        val provider = FakeAiProvider(finishReason = AiFinishReason.LENGTH)

        val result = AiGenerateHandler(provider)
            .handle(params("prompt" to "Summarise", "maxTokens" to 64, "temperature" to 0.5))
            .jsonObject

        assertEquals(listOf(AiRequest("Summarise", 64, 0.5f)), provider.requests)
        assertEquals("Hello, world", result["text"]!!.jsonPrimitive.content)
        assertEquals("length", result["finishReason"]!!.jsonPrimitive.content)
    }

    @Test
    fun `generate without a prompt is a parse error`() = runTest {
        try {
            AiGenerateHandler(FakeAiProvider()).handle(params("prompt" to "  "))
            fail("expected PARSE_ERROR")
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.ParseError, e.error)
        }
    }

    @Test
    fun `generate on an unavailable device fails with AI_UNAVAILABLE`() = runTest {
        val provider = FakeAiProvider(AiAvailability(AiTier.UNAVAILABLE, AiStatus.UNAVAILABLE, "no tier"))
        try {
            AiGenerateHandler(provider).handle(params("prompt" to "hi"))
            fail("expected AI_UNAVAILABLE")
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.AiUnavailable, e.error)
            assertEquals("no tier", e.detail)
        }
    }

    @Test
    fun `stream emits each chunk tagged with the streamId, then returns the whole reply`() = runTest {
        val emitter = FakeBridgeEventEmitter()

        val result = AiStreamHandler(FakeAiProvider(), emitter)
            .handle(params("prompt" to "hi", "streamId" to "s1"))
            .jsonObject

        assertEquals(List(3) { AiMethods.STREAM_CHUNK }, emitter.methods)
        assertEquals(
            listOf("Hello", ", ", "world"),
            emitter.emissions.map { it.params.jsonObject["text"]!!.jsonPrimitive.content },
        )
        assertEquals(setOf("s1"), emitter.emissions.map { it.params.jsonObject["streamId"]!!.jsonPrimitive.content }.toSet())
        assertEquals("Hello, world", result["text"]!!.jsonPrimitive.content)
        assertEquals("stop", result["finishReason"]!!.jsonPrimitive.content)
    }

    @Test
    fun `stream without a streamId is a parse error`() = runTest {
        try {
            AiStreamHandler(FakeAiProvider(), FakeBridgeEventEmitter()).handle(params("prompt" to "hi"))
            fail("expected PARSE_ERROR")
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.ParseError, e.error)
        }
    }

    @Test
    fun `the factory registers all four methods`() {
        assertEquals(
            listOf("ai.availability", "ai.prepare", "ai.generate", "ai.stream"),
            aiHandlers(FakeAiProvider(), FakeBridgeEventEmitter()).map { it.method },
        )
    }
}
