// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/**
 * Persistence seam for CodeSync state (device id + current bundle bookkeeping).
 * Injectable so the manager is unit-testable with an in-memory fake; the production
 * implementation survives process death via SharedPreferences.
 */
interface CodeSyncStore {
    /** Stable per-installation device id (created on first access). */
    fun deviceId(): String

    /** Build number of the currently installed bundle, or -1 when none. */
    fun currentBuildNumber(): Long

    /** Book-keeping after a successful install. */
    fun setCurrentBundle(buildNumber: Long, bundleId: String, bundlePath: String)

    fun currentBundleId(): String?

    fun currentBundlePath(): String?
}

class PrefsCodeSyncStore(context: Context) : CodeSyncStore {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun deviceId(): String {
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrEmpty()) return existing
        val fresh = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, fresh).apply()
        return fresh
    }

    override fun currentBuildNumber(): Long = prefs.getLong(KEY_BUILD_NUMBER, -1L)

    override fun setCurrentBundle(buildNumber: Long, bundleId: String, bundlePath: String) {
        prefs.edit()
            .putLong(KEY_BUILD_NUMBER, buildNumber)
            .putString(KEY_BUNDLE_ID, bundleId)
            .putString(KEY_BUNDLE_PATH, bundlePath)
            .apply()
    }

    override fun currentBundleId(): String? =
        prefs.getString(KEY_BUNDLE_ID, null)?.takeIf { it.isNotEmpty() }

    override fun currentBundlePath(): String? =
        prefs.getString(KEY_BUNDLE_PATH, null)?.takeIf { it.isNotEmpty() }

    private companion object {
        const val PREFS_NAME = "codesync"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_BUILD_NUMBER = "current_build_number"
        const val KEY_BUNDLE_ID = "current_bundle_id"
        const val KEY_BUNDLE_PATH = "current_bundle_path"
    }
}
