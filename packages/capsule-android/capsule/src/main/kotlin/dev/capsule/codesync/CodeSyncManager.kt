// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import android.webkit.WebView
import com.google.common.hash.Hashing
import dev.capsule.runtime.BundleStore
import java.io.File
import kotlinx.serialization.json.Json

/**
 * Manages over-the-air (OTA) updates for the Capsule Android shell.
 *
 * Orchestrates: update check (CDN-cacheable GET) → client-side rollout decision →
 * bundle download → SHA-256 verification → extraction → install via [BundleStore]'s
 * atomic two-slot swap. Every side-effecting dependency is injected ([CodeSyncTransport],
 * [CodeSyncStore], [BundleStore]) so the full flow is unit-testable with fakes.
 *
 * API is `suspend`-first: the bridge handlers are suspend too, so no callback plumbing
 * and no manager-owned scope.
 */
class CodeSyncManager(
    private val config: CodeSyncConfig,
    private val transport: CodeSyncTransport,
    private val store: CodeSyncStore,
    private val bundleStore: BundleStore,
    private val bundlesRoot: File,
) {

    private val json = Json { ignoreUnknownKeys = true }

    @Volatile var lastStatus: String = CodeSyncStatus.IDLE
        private set

    /** Bundle staged by the latest successful check — reported by the bridge until applied. */
    @Volatile var pendingUpdate: BundleInfo? = null
        private set

    /** CDN-cacheable check URL — no device-specific headers, per codesync-internals.md. */
    internal fun checkUrl(): String =
        "${config.url.trimEnd('/')}/v1/check/${config.appId}/${config.channel}/${config.nativeVersion}"

    internal fun checkinUrl(): String =
        "${config.url.trimEnd('/')}/v1/devices/checkin"

    /**
     * Checks for an available OTA update, downloads and installs it when in rollout and
     * newer than the installed build. Never throws — failures come back as [UpdateResult.Error].
     */
    suspend fun checkForUpdate(): UpdateResult {
        lastStatus = CodeSyncStatus.CHECKING
        val currentBuildNumber = store.currentBuildNumber()

        val responseBody = try {
            val result = transport.get(checkUrl())
            if (result.code != 200) {
                return fail("HTTP ${result.code} from check endpoint")
            }
            result.body.decodeToString()
        } catch (e: Exception) {
            return fail("Network error: ${e.message}")
        }

        val check = try {
            json.decodeFromString<CheckResponse>(responseBody)
        } catch (e: Exception) {
            return fail("Failed to parse check response: ${e.message}")
        }

        // Fire-and-forget telemetry — never affects the check outcome.
        reportCheckin(check.bundle.id)

        // Client-side rollout decision — deterministic, no extra server round-trip.
        val inRollout = Rollout.isInRollout(store.deviceId(), check.bundle.rolloutPercent)
        if (!inRollout || check.bundle.buildNumber <= currentBuildNumber) {
            lastStatus = CodeSyncStatus.IDLE
            return UpdateResult.UpToDate
        }

        return downloadAndInstall(check.bundle)
    }

    private suspend fun downloadAndInstall(bundle: BundleInfo): UpdateResult {
        lastStatus = CodeSyncStatus.DOWNLOADING
        val bundleDir = File(bundlesRoot, bundle.id)
        val zipFile = File(bundleDir, "bundle.zip")

        val zipBytes = try {
            val result = transport.get(bundle.url)
            if (result.code != 200) {
                return fail("Download failed: HTTP ${result.code}", bundleDir)
            }
            result.body
        } catch (e: Exception) {
            return fail("Download failed: ${e.message}", bundleDir)
        }

        // Integrity gate — reject + report on any mismatch (040-CodeSync security section).
        val computedHash = Hashing.sha256().hashBytes(zipBytes).toString()
        if (!computedHash.equals(bundle.sha256Hex, ignoreCase = true)) {
            return fail("Hash verification failed", bundleDir)
        }
        if (!bundleDir.isDirectory && !bundleDir.mkdirs()) {
            return fail("Failed to create bundle directory", bundleDir)
        }
        zipFile.writeBytes(zipBytes)

        lastStatus = CodeSyncStatus.APPLYING
        if (!CodeSyncUnzipper.unzip(zipFile, bundleDir)) {
            return fail("Failed to extract bundle", bundleDir)
        }
        zipFile.delete()

        val wwwIndex = File(bundleDir, "www/index.html")
        if (!wwwIndex.isFile) {
            return fail("Invalid bundle: missing www/index.html", bundleDir)
        }

        try {
            // Atomic swap: current active → previous, staged → active (BundleStore contract).
            bundleStore.install(bundleDir.absolutePath)
        } catch (e: Exception) {
            return fail("Failed to install bundle: ${e.message}", bundleDir)
        }

        // Same book-keeping as the iOS CodeSyncManager: the next check compares against this
        // build, and codesync.applyUpdate() finds the pending bundle.
        store.setCurrentBundle(
            buildNumber = bundle.buildNumber,
            bundleId = bundle.id,
            bundlePath = bundleDir.absolutePath,
        )
        pendingUpdate = bundle
        lastStatus = CodeSyncStatus.DOWNLOAD_READY
        return UpdateResult.UpdateReady(bundleDir.absolutePath)
    }

    /** Loads the previously downloaded bundle on next resume. Platform-edge (WebView). */
    fun applyUpdateOnNextResume(webView: WebView) {
        val path = store.currentBundlePath() ?: return
        webView.loadUrl("file://$path/index.html")
    }

    /** Fire-and-forget device telemetry; failures are swallowed by design. */
    private suspend fun reportCheckin(bundleId: String) {
        try {
            val checkin = DeviceCheckin(
                deviceId = store.deviceId(),
                appId = config.appId,
                nativeVersion = config.nativeVersion,
                bundleId = bundleId,
                channel = config.channel,
            )
            // encodeDefaults: telemetry fields carrying defaults (platform) must still be sent.
            val serializerJson = Json { encodeDefaults = true }
            transport.postJson(checkinUrl(), serializerJson.encodeToString(DeviceCheckin.serializer(), checkin))
        } catch (_: Exception) {
            // Fire-and-forget — telemetry must never break the check flow.
        }
    }

    private fun fail(message: String, bundleDir: File? = null): UpdateResult {
        bundleDir?.deleteRecursively()
        lastStatus = CodeSyncStatus.ERROR
        return UpdateResult.Error(message)
    }
}
