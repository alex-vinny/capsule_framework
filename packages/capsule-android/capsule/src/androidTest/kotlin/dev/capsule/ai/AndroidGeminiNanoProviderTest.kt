// Docs: docs/guide/ai.md
package dev.capsule.ai

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device smoke test for the Tier-1 provider (adr-003 testing tier 4): structure, never exact
 * text — model output is non-deterministic. On devices without AICore / Gemini Nano (most
 * emulators) only the availability contract runs; the generation checks are skipped.
 */
@RunWith(AndroidJUnit4::class)
class AndroidGeminiNanoProviderTest {

    private val provider = AndroidGeminiNanoProvider()

    @Test
    fun availability_never_throws_and_explains_anything_but_ready() = runBlocking {
        val availability = provider.availability()

        assertEquals(AiTier.OS_NATIVE, availability.tier)
        if (availability.status != AiStatus.READY) assertNotNull(availability.reason)
    }

    @Test
    fun a_short_generation_returns_text_when_gemini_nano_is_ready() = runBlocking {
        assumeTrue("Gemini Nano not ready on this device", provider.availability().status == AiStatus.READY)

        val result = provider.generate(AiRequest("Reply with one word: hello", maxTokens = 16))

        assertTrue(result.text.isNotBlank())
    }

    @Test
    fun streaming_delivers_chunks_that_add_up_to_the_result() = runBlocking {
        assumeTrue("Gemini Nano not ready on this device", provider.availability().status == AiStatus.READY)
        val chunks = mutableListOf<String>()

        val result = provider.stream(AiRequest("Count from one to five in words", maxTokens = 32)) { chunks += it }

        assertTrue(chunks.isNotEmpty())
        assertEquals(result.text, chunks.joinToString(""))
    }
}
