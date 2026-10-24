// Docs: docs/reference/core-api.md
package dev.capsule.camera

import org.junit.Assert.assertEquals
import org.junit.Test

class InSampleSizeTest {

    @Test
    fun `no max means full resolution`() {
        assertEquals(1, calculateInSampleSize(4000, 3000, null, null))
    }

    @Test
    fun `subsamples by powers of two toward the target`() {
        // 4000x3000 down toward 1000x1000: halves stay >= target until factor 2.
        assertEquals(2, calculateInSampleSize(4000, 3000, 1000, 1000))
    }

    @Test
    fun `larger downscale yields a larger factor`() {
        assertEquals(4, calculateInSampleSize(4000, 3000, 500, 500))
    }

    @Test
    fun `target near source keeps factor at one`() {
        assertEquals(1, calculateInSampleSize(1200, 900, 1000, 1000))
    }
}
