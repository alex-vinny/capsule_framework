// Docs: docs/concepts/architecture.md
package dev.capsule

import dev.capsule.codesync.CodeSyncConfig

/**
 * Shell-level configuration. [codeSync] opts the app into OTA updates — when null,
 * no CodeSync handlers exist on the bridge surface at all.
 */
data class CapsuleShellConfig(
    /**
     * Reverse-DNS app identifier, e.g. "com.example.myapp". Used to derive the embedded server
     * port, so it must differ between apps on one device — null means the app's package name.
     * (A shared constant gave every Capsule app the same port: the second to start found it taken.)
     */
    val appId: String? = null,
    /** When non-null, the WebView loads from this URL (dev mode). Overrides the embedded server. */
    val devServerUrl: String? = null,
    /** How long (ms) to wait for the embedded server to bind before showing the error screen. */
    val serverTimeoutMs: Long = 3_000,
    /** OTA (CodeSync) configuration; null = feature disabled. */
    val codeSync: CodeSyncConfig? = null,
)
