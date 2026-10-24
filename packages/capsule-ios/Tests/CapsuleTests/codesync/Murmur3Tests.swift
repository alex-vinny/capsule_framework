// Docs: docs/contributing/codesync-internals.md
//
//  Murmur3Tests.swift
//  CapsuleTests
//
//  Pins MurmurHash3.x86_32 and Rollout.isInRollout to the TypeScript reference
//  implementation (`murmurhash3js-revisited` `x86.hash32(UTF-8 bytes, seed=0)`), which
//  is the shared source of truth for the rollout bucket. The SAME vectors pin the
//  Android `RolloutTest` — all three implementations are provably identical on the
//  same inputs, including multi-byte UTF-8.
//

import XCTest
@testable import Capsule

final class Murmur3Tests: XCTestCase {

    // MARK: - Hash vectors (from murmurhash3js-revisited x86.hash32, seed 0)

    func testEmptyStringHashesToZero() {
        XCTAssertEqual(MurmurHash3.x86_32(bytes: [], seed: 0), 0)
    }

    func testASCIIVectorsMatchTheTSReference() {
        XCTAssertEqual(MurmurHash3.x86_32(bytes: Array("hello".utf8)), 613_153_351)
        XCTAssertEqual(MurmurHash3.x86_32(bytes: Array("a".utf8)), 1_009_084_850)
        XCTAssertEqual(MurmurHash3.x86_32(bytes: Array("abc".utf8)), 3_017_643_002)
        XCTAssertEqual(MurmurHash3.x86_32(bytes: Array("device-1".utf8)), 405_906_941)
        XCTAssertEqual(MurmurHash3.x86_32(bytes: Array("device-2".utf8)), 1_084_850_768)
    }

    func testMultiByteUTF8VectorsMatchTheTSReference() {
        XCTAssertEqual(MurmurHash3.x86_32(bytes: Array("café-úâ".utf8)), 1_810_966_122)
        XCTAssertEqual(
            MurmurHash3.x86_32(bytes: Array(String(repeating: "é", count: 100).utf8)),
            2_150_498_464)
    }

    func testUUIDShapedDeviceIDVectorsMatchTheTSReference() {
        XCTAssertEqual(
            MurmurHash3.x86_32(bytes: Array("3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d".utf8)),
            3_359_360_964)
        XCTAssertEqual(
            MurmurHash3.x86_32(bytes: Array("b1e6c9a2-5f8d-4a3c-8e7b-6d5c4b3a2f1e".utf8)),
            2_638_063_337)
    }

    // MARK: - Bucket regression: high-bit hashes use the UNSIGNED bucket

    func testHighBitHashBucketsMatchTheTSUnsignedModulo() {
        func bucketOf(_ deviceId: String) -> Int {
            Int(MurmurHash3.x86_32(bytes: Array(deviceId.utf8)) % 100)
        }
        // "abc" hashes to 0xB3DD93FA (high bit set) — bucket 2, not the signed/abs 94.
        XCTAssertEqual(bucketOf("abc"), 2)
        XCTAssertEqual(bucketOf("hello"), 51)
        XCTAssertEqual(bucketOf("device-1"), 41)
    }

    // MARK: - Rollout boundary behavior

    func testPercent100AlwaysIncludesEveryDevice() {
        XCTAssertTrue(Rollout.isInRollout(deviceId: "anything", percent: 100))
    }

    func testPercent0ExcludesEveryDevice() {
        XCTAssertFalse(Rollout.isInRollout(deviceId: "anything", percent: 0))
    }

    func testAssignmentIsDeterministicAcrossCalls() {
        let first = Rollout.isInRollout(deviceId: "device-1", percent: 50)
        for _ in 0..<10 {
            XCTAssertEqual(Rollout.isInRollout(deviceId: "device-1", percent: 50), first)
        }
    }

    func testDeviceIDsLandInTheirTSReferenceBuckets() {
        // bucket(device-1) = 41 -> in at 42+, out at 41.
        XCTAssertFalse(Rollout.isInRollout(deviceId: "device-1", percent: 41))
        XCTAssertTrue(Rollout.isInRollout(deviceId: "device-1", percent: 42))
        // bucket(device-2) = 68 -> in at 69+, out at 68.
        XCTAssertFalse(Rollout.isInRollout(deviceId: "device-2", percent: 68))
        XCTAssertTrue(Rollout.isInRollout(deviceId: "device-2", percent: 69))
        // bucket(3f2b8c1e-…) = 64 -> excluded at 64, included at 65.
        XCTAssertFalse(Rollout.isInRollout(
            deviceId: "3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d", percent: 64))
        XCTAssertTrue(Rollout.isInRollout(
            deviceId: "3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d", percent: 65))
    }
}
