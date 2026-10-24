// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import com.google.common.hash.Hashing
import java.nio.charset.StandardCharsets

/**
 * Deterministic gradual-rollout cohort assignment.
 *
 * MUST match the TypeScript `isInRollout()` in the CodeSync server: MurmurHash3 x86 32-bit
 * over the **UTF-8 bytes** of the device id (`murmurhash3js-revisited` `x86.hash32(bytes, seed)`),
 * bucketed by the **unsigned** hash modulo 100.
 *
 * Sign handling is the whole trap: a Java/Kotlin `Int` reinterprets the 32-bit hash as signed,
 * and `Math.abs()` of a negative hash maps to `2^32 - hash`, whose `% 100` differs from the
 * unsigned bucket for roughly half of all device ids. The bucket must therefore come from the
 * unsigned value. Test vectors in `RolloutTest` are generated from the TS implementation and
 * pin this contract.
 */
object Rollout {

    fun isInRollout(deviceId: String, percent: Int, seed: Int = 0): Boolean {
        if (percent >= 100) return true
        if (percent <= 0) return false
        val hashBytes = deviceId.toByteArray(StandardCharsets.UTF_8)
        val hash = Hashing.murmur3_32_fixed(seed).hashBytes(hashBytes).asInt()
        // Mask stays in the Long domain — a toInt() after the mask would overflow back to
        // negative and land every high-bit hash in a negative bucket, i.e. always in rollout.
        val bucket = ((hash.toLong() and 0xFFFFFFFFL) % 100L).toInt()
        return bucket < percent
    }
}
