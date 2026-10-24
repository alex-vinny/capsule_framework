// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

/**
 * Configuration for the CodeSync (OTA) client. Self-contained — the shell opts in by
 * setting [CapsuleShellConfig.codeSync]; when null, no CodeSync handlers are registered
 * and the feature is absent from the bridge surface.
 */
data class CodeSyncConfig(
    /** Base URL of the CodeSync backend, e.g. "https://codesync.example.com". */
    val url: String,
    /** Reverse-DNS app identifier matching the CodeSync app registration. */
    val appId: String,
    /** Deployment channel: "production", "staging", … */
    val channel: String = "production",
    /** The installed shell (native) version, e.g. "1.4.0" — gates which bundles apply. */
    val nativeVersion: String,
)
