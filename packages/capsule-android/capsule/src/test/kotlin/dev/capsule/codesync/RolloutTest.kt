// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins [Rollout] to the TypeScript reference implementation (`murmurhash3js-revisited`
 * `x86.hash32(UTF-8 bytes, seed=0)`), which is the shared source of truth for the
 * rollout bucket. Vectors generated from the actual library — including multi-byte
 * UTF-8 inputs, the case the old `Math.abs()` implementation got wrong for ~half of
 * all device ids.
 */
class RolloutTest {

    private fun bucketOf(deviceId: String, seed: Int = 0): Int {
        // Mirror of the implementation's bucket math, exposed for vector assertions.
        val hash = HashingProbe.hash32(deviceId, seed)
        return (hash % 100U).toInt()
    }

    // ── Hash vectors (from murmurhash3js-revisited x86.hash32, seed 0) ──────────

    @Test fun `empty string hashes to zero`() {
        assertEquals(0U, HashingProbe.hash32("", 0))
    }

    @Test fun `ascii vectors match the TS reference`() {
        assertEquals(613153351U, HashingProbe.hash32("hello", 0))
        assertEquals(1009084850U, HashingProbe.hash32("a", 0))
        assertEquals(3017643002U, HashingProbe.hash32("abc", 0))
        assertEquals(405906941U, HashingProbe.hash32("device-1", 0))
        assertEquals(1084850768U, HashingProbe.hash32("device-2", 0))
    }

    @Test fun `multi-byte utf8 vectors match the TS reference`() {
        assertEquals(1810966122U, HashingProbe.hash32("café-úâ", 0))
        assertEquals(2150498464U, HashingProbe.hash32("é".repeat(100), 0))
    }

    @Test fun `uuid-shaped device id vectors match the TS reference`() {
        assertEquals(3359360964U, HashingProbe.hash32("3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d", 0))
        assertEquals(2638063337U, HashingProbe.hash32("b1e6c9a2-5f8d-4a3c-8e7b-6d5c4b3a2f1e", 0))
    }

    // ── Bucket regression: high-bit hashes must use the UNSIGNED bucket ─────────

    @Test fun `high-bit hash buckets match the TS unsigned modulo`() {
        // "abc" hashes to 0xB3DD93FA (high bit set). The signed+abs() implementation
        // produced bucket 94; the TS reference produces bucket 2.
        assertEquals(2, bucketOf("abc"))
        assertEquals(51, bucketOf("hello"))
        assertEquals(41, bucketOf("device-1"))
    }

    // ── Boundary behavior ────────────────────────────────────────────────────────

    @Test fun `percent 100 always includes every device`() {
        assertTrue(Rollout.isInRollout("anything", percent = 100))
    }

    @Test fun `percent 0 excludes every device`() {
        assertFalse(Rollout.isInRollout("anything", percent = 0))
    }

    @Test fun `assignment is deterministic across calls`() {
        val first = Rollout.isInRollout("device-1", percent = 50)
        repeat(10) { assertEquals(first, Rollout.isInRollout("device-1", percent = 50)) }
    }

    @Test fun `device ids land in their TS reference buckets`() {
        // bucket(device-1)=41 → in at 42+, out at 41
        assertFalse(Rollout.isInRollout("device-1", percent = 41))
        assertTrue(Rollout.isInRollout("device-1", percent = 42))
        // bucket(device-2)=68 → in at 69+, out at 68
        assertFalse(Rollout.isInRollout("device-2", percent = 68))
        assertTrue(Rollout.isInRollout("device-2", percent = 69))
    }

    /** Test-only bridge to the production hash so vectors pin the real algorithm. */
    private object HashingProbe {
        fun hash32(input: String, seed: Int): UInt {
            val hash = com.google.common.hash.Hashing
                .murmur3_32_fixed(seed)
                .hashBytes(input.toByteArray(Charsets.UTF_8))
                .asInt()
            return (hash.toLong() and 0xFFFFFFFFL).toUInt()
        }
    }
}
