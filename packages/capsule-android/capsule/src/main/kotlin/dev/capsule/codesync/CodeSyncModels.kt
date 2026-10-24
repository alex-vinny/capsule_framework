// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire types for the CodeSync check endpoint — mirror `@capsule/core` and
 * `docs/contributing/codesync-internals.md` exactly. The wire JSON is the cross-platform contract
 * (Android + iOS + server decode the same shape).
 */
@Serializable
data class CheckResponse(
    val latestBuildNumber: Long,
    val bundle: BundleInfo,
)

@Serializable
data class BundleInfo(
    val id: String,
    val url: String,
    /** Server sends `"hash": "sha256:<hex>"`; [sha256Hex] exposes the bare hex. */
    @SerialName("hash") val hash: String,
    val sizeBytes: Long,
    val version: String,
    val buildNumber: Long,
    val rolloutPercent: Int = 100,
    val mandatory: Boolean = false,
) {
    /** Bare SHA-256 hex with the "sha256:" prefix (if present) stripped. */
    val sha256Hex: String
        get() = hash.removePrefix("sha256:")
}

// ── Bridge DTOs (shapes consumed by `@capsule/core`'s CodeSyncModule) ──────────

/** Status strings MUST match the JS `CodeSyncStatus` union exactly (note the spaces). */
object CodeSyncStatus {
    const val IDLE = "idle"
    const val CHECKING = "checking"
    const val DOWNLOAD_READY = "download ready"
    const val DOWNLOADING = "downloading"
    const val DOWNLOAD_FAILED = "download failed"
    const val APPLYING = "applying"
    const val UPDATE_APPLIED = "update applied"
    const val ERROR = "error"
}

@Serializable
data class CodeSyncUpdateDTO(
    val version: String,
    val buildNumber: Long,
    val notes: String? = null,
    val mandatory: Boolean = false,
    val rolloutPercent: Int = 100,
)

/** Response body for `codesync.checkForUpdate` / `codesync.getStatus`. */
@Serializable
data class CodeSyncCheckResultDTO(
    val status: String,
    val update: CodeSyncUpdateDTO? = null,
)

/** Response body for `codesync.applyUpdate`. */
@Serializable
data class CodeSyncApplyResultDTO(
    val status: String,
)

/** Body of the fire-and-forget device check-in POST (`/v1/devices/checkin`). */
@Serializable
data class DeviceCheckin(
    val deviceId: String,
    val appId: String,
    val platform: String = "android",
    val nativeVersion: String,
    val bundleId: String? = null,
    val channel: String,
)

/**
 * Result of an OTA update check — the manager's core outcome, mapped to
 * [CodeSyncCheckResultDTO] at the bridge boundary (see [toCheckResult]).
 */
sealed class UpdateResult {
    object UpToDate : UpdateResult()
    data class UpdateReady(val bundlePath: String) : UpdateResult()
    data class Error(val message: String) : UpdateResult()
}

/** Pure mapping UpdateResult → bridge DTO, so the shape is unit-testable without a bridge. */
internal fun UpdateResult.toCheckResult(): CodeSyncCheckResultDTO = when (this) {
    is UpdateResult.UpToDate -> CodeSyncCheckResultDTO(status = CodeSyncStatus.IDLE)
    is UpdateResult.UpdateReady ->
        // `update` details are filled by the handler from the last check response; the
        // manager keeps the pending BundleInfo alongside the result.
        CodeSyncCheckResultDTO(status = CodeSyncStatus.DOWNLOAD_READY)
    is UpdateResult.Error -> CodeSyncCheckResultDTO(status = CodeSyncStatus.ERROR)
}
