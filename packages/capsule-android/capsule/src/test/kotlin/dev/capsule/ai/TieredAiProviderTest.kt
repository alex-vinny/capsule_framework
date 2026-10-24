// Docs: docs/guide/ai.md
package dev.capsule.ai

import dev.capsule.fakes.FakeAiProvider
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class TieredAiProviderTest {

    private val bundled = UnavailableAiProvider(AiTier.BUNDLED, "Bundled models land in Phase 6")
    private val cloud = UnavailableAiProvider(AiTier.CLOUD, "Cloud inference lands in Phase 6")

    private fun osNative(status: AiStatus, reason: String? = null) =
        FakeAiProvider(availability = AiAvailability(AiTier.OS_NATIVE, status, reason))

    @Test
    fun `the first ready tier serves`() = runTest {
        val cloudReady = FakeAiProvider(availability = AiAvailability(AiTier.CLOUD, AiStatus.READY), chunks = listOf("from cloud"))
        val ai = TieredAiProvider(listOf(osNative(AiStatus.UNAVAILABLE, "no AICore"), bundled, cloudReady))

        assertEquals(AiAvailability(AiTier.CLOUD, AiStatus.READY), ai.availability())
        assertEquals("from cloud", ai.generate(AiRequest("hi")).text)
    }

    @Test
    fun `an earlier ready tier wins over a later one`() = runTest {
        val first = osNative(AiStatus.READY)
        val second = FakeAiProvider(availability = AiAvailability(AiTier.CLOUD, AiStatus.READY))

        TieredAiProvider(listOf(first, second)).generate(AiRequest("hi"))

        assertEquals(1, first.requests.size)
        assertEquals(0, second.requests.size)
    }

    @Test
    fun `a downloadable tier is reported over unavailable ones`() = runTest {
        val ai = TieredAiProvider(listOf(osNative(AiStatus.DOWNLOADABLE, "call ai.prepare()"), bundled, cloud))

        assertEquals(AiAvailability(AiTier.OS_NATIVE, AiStatus.DOWNLOADABLE, "call ai.prepare()"), ai.availability())
    }

    @Test
    fun `prepare readies the most promising tier`() = runTest {
        val nano = osNative(AiStatus.DOWNLOADABLE).apply {
            afterPrepare = AiAvailability(AiTier.OS_NATIVE, AiStatus.READY)
        }
        val ai = TieredAiProvider(listOf(nano, bundled, cloud))

        assertEquals(AiStatus.READY, ai.prepare().status)
        assertEquals(1, nano.prepareCalls)
        assertEquals("Hello, world", ai.generate(AiRequest("hi")).text)
    }

    @Test
    fun `prepare does nothing when a tier is already ready`() = runTest {
        val nano = osNative(AiStatus.READY)

        TieredAiProvider(listOf(nano)).prepare()

        assertEquals(0, nano.prepareCalls)
    }

    @Test
    fun `with no usable tier, availability lists every reason`() = runTest {
        val ai = TieredAiProvider(listOf(osNative(AiStatus.UNAVAILABLE, "no AICore"), bundled, cloud))

        val availability = ai.availability()

        assertEquals(AiTier.UNAVAILABLE, availability.tier)
        assertEquals(AiStatus.UNAVAILABLE, availability.status)
        assertEquals(
            "os-native: no AICore; bundled: Bundled models land in Phase 6; cloud: Cloud inference lands in Phase 6",
            availability.reason,
        )
    }

    @Test
    fun `generating without a ready tier fails with AI_UNAVAILABLE and the reason`() = runTest {
        val ai = TieredAiProvider(listOf(osNative(AiStatus.DOWNLOADABLE, "call ai.prepare()"), cloud))
        try {
            ai.generate(AiRequest("hi"))
            fail("expected AI_UNAVAILABLE")
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.AiUnavailable, e.error)
            assertEquals("call ai.prepare()", e.detail)
        }
    }

    @Test
    fun `stream passes the ready tier's chunks through`() = runTest {
        val chunks = mutableListOf<String>()

        val result = TieredAiProvider(listOf(bundled, osNative(AiStatus.READY))).stream(AiRequest("hi")) { chunks += it }

        assertEquals(listOf("Hello", ", ", "world"), chunks)
        assertEquals("Hello, world", result.text)
    }

    @Test
    fun `an unavailable provider never generates`() = runTest {
        try {
            bundled.generate(AiRequest("hi"))
            fail("expected AI_UNAVAILABLE")
        } catch (e: CapsuleException) {
            assertEquals(BridgeError.AiUnavailable, e.error)
            assertTrue(e.detail!!.contains("Phase 6"))
        }
    }
}
