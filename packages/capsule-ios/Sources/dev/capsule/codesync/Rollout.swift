// Docs: docs/contributing/codesync-internals.md
//
//  Rollout.swift
//  Capsule iOS
//
//  Port of dev.capsule.codesync.Rollout (Android) — deterministic gradual-rollout
//  cohort assignment.
//
//  MUST match the TypeScript `isInRollout()` in the CodeSync server: MurmurHash3
//  x86 32-bit over the UTF-8 bytes of the device id, bucketed by the UNSIGNED hash
//  modulo 100. Swift's UInt32 makes the unsigned semantics natural (the trap that
//  bit the first Android skeleton was signed `Int` + `Math.abs()`).
//

import Foundation

public enum Rollout {
    public static func isInRollout(deviceId: String, percent: Int, seed: UInt32 = 0) -> Bool {
        if percent >= 100 { return true }
        if percent <= 0 { return false }
        let bucket = Int(MurmurHash3.x86_32(bytes: Array(deviceId.utf8), seed: seed) % 100)
        return bucket < percent
    }
}
