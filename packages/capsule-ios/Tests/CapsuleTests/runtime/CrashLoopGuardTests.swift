// Docs: docs/contributing/codesync-internals.md
//
//  CrashLoopGuardTests.swift
//  CapsuleTests
//
//  Port of dev.capsule.runtime.CrashLoopGuardTest (Android) — same nine cases,
//  same semantics, pinned by a fake clock + fake log.
//

import XCTest
@testable import Capsule

final class CrashLoopGuardTests: XCTestCase {

    private func makeGuard(
        log: FakeCrashLog = FakeCrashLog(),
        clock: FakeClock = FakeClock(),
        threshold: Int = 3,
        windowMs: Int64 = 60_000
    ) -> (CrashLoopGuard, FakeClock) {
        (
            CrashLoopGuard(log: log, clock: clock, threshold: threshold, windowMs: windowMs),
            clock
        )
    }

    func testNoLaunchesIsNotACrashLoop() {
        let (guard_, _) = makeGuard()
        XCTAssertFalse(guard_.isCrashLooping())
    }

    func testFewerThanThresholdLaunchesIsNotACrashLoop() {
        let (guard_, clock) = makeGuard()
        guard_.recordLaunchAttempt()
        clock.advance(1_000)
        guard_.recordLaunchAttempt()
        XCTAssertFalse(guard_.isCrashLooping())
    }

    func testThresholdLaunchesWithinWindowIsACrashLoop() {
        let (guard_, clock) = makeGuard()
        guard_.recordLaunchAttempt()
        clock.advance(1_000)
        guard_.recordLaunchAttempt()
        clock.advance(1_000)
        guard_.recordLaunchAttempt()
        XCTAssertTrue(guard_.isCrashLooping())
    }

    func testLaunchesSpreadBeyondTheWindowAreNotACrashLoop() {
        let (guard_, clock) = makeGuard()
        guard_.recordLaunchAttempt()  // t=0
        clock.advance(30_000)
        guard_.recordLaunchAttempt()  // t=30s
        clock.advance(40_000)  // t=70s — first attempt now outside the 60s window
        guard_.recordLaunchAttempt()  // t=70s
        // Only the t=30s and t=70s attempts are within the trailing 60s -> 2 < 3.
        XCTAssertFalse(guard_.isCrashLooping())
    }

    func testOldCrashesAgeOutOfTheWindow() {
        let (guard_, clock) = makeGuard()
        for _ in 0..<3 { guard_.recordLaunchAttempt() }  // 3 at t=0 -> looping
        XCTAssertTrue(guard_.isCrashLooping())
        clock.advance(60_001)  // all 3 now older than the window
        XCTAssertFalse(guard_.isCrashLooping())
    }

    func testClearResetsTheCrashRecord() {
        let (guard_, _) = makeGuard()
        for _ in 0..<3 { guard_.recordLaunchAttempt() }
        XCTAssertTrue(guard_.isCrashLooping())
        guard_.clear()
        XCTAssertFalse(guard_.isCrashLooping())
    }

    func testCustomThresholdIsHonored() {
        let (guard_, _) = makeGuard(threshold: 2)
        guard_.recordLaunchAttempt()
        XCTAssertFalse(guard_.isCrashLooping())
        guard_.recordLaunchAttempt()
        XCTAssertTrue(guard_.isCrashLooping())
    }

    func testBoundaryTimestampExactlyAtWindowEdgeStillCounts() {
        let log = FakeCrashLog()
        let clock = FakeClock(nowMs: 60_000)
        let guard_ = CrashLoopGuard(log: log, clock: clock, threshold: 1, windowMs: 60_000)
        log.record(timestampMs: 0)  // exactly windowMs ago
        XCTAssertTrue(guard_.isCrashLooping())
    }

    func testDefaultsAreThreeCrashesInSixtySeconds() {
        let guard_ = CrashLoopGuard(log: FakeCrashLog())
        XCTAssertEqual(guard_.threshold, 3)
        XCTAssertEqual(guard_.windowMs, 60_000)
    }
}
