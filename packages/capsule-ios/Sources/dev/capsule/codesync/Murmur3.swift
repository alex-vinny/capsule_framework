// Docs: docs/contributing/codesync-internals.md
//
//  Murmur3.swift
//  Capsule iOS
//
//  Pure Swift implementation of MurmurHash3 x86 32-bit — the reference algorithm
//  (seeded), matching `murmurhash3js-revisited`'s `x86.hash32(bytes, seed)` on the TS
//  side and Guava's `murmur3_32_fixed()` on the Android side.
//
//  Pinned by shared test vectors generated from the TS library (see Murmur3Tests) —
//  the same vectors the Android `RolloutTest` pins, so all three implementations are
//  provably identical on the same inputs.
//

import Foundation

public enum MurmurHash3 {
    /// MurmurHash3 x86 32-bit over `bytes` with `seed`.
    public static func x86_32(bytes: [UInt8], seed: UInt32 = 0) -> UInt32 {
        let c1: UInt32 = 0xcc9e2d51
        let c2: UInt32 = 0x1b873593
        let byteCount = bytes.count

        var h1 = seed
        var i = 0

        // Body: 4-byte little-endian chunks.
        while i + 4 <= byteCount {
            var k1: UInt32 =
                UInt32(bytes[i])
                | (UInt32(bytes[i + 1]) << 8)
                | (UInt32(bytes[i + 2]) << 16)
                | (UInt32(bytes[i + 3]) << 24)
            k1 = rotl(k1 &* c1, 15) &* c2
            h1 = rotl(h1 ^ k1, 13) &* 5 &+ 0xe6546b64
            i += 4
        }

        // Tail: remaining 0–3 bytes, least-significant first.
        var k1: UInt32 = 0
        let tailLength = byteCount - i
        if tailLength >= 3 { k1 ^= UInt32(bytes[i + 2]) << 16 }
        if tailLength >= 2 { k1 ^= UInt32(bytes[i + 1]) << 8 }
        if tailLength >= 1 {
            k1 ^= UInt32(bytes[i])
            k1 = rotl(k1 &* c1, 15) &* c2
            h1 ^= k1
        }

        // Finalization.
        h1 ^= UInt32(truncatingIfNeeded: byteCount)
        h1 ^= h1 >> 16
        h1 = h1 &* 0x85ebca6b
        h1 ^= h1 >> 13
        h1 = h1 &* 0xc2b2ae35
        h1 ^= h1 >> 16
        return h1
    }

    @inline(__always)
    private static func rotl(_ value: UInt32, _ count: UInt32) -> UInt32 {
        (value << count) | (value >> (32 - count))
    }
}
