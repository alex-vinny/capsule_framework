package dev.capsule.fakes

import dev.capsule.codesync.CodeSyncStore

/** In-memory [CodeSyncStore] for unit tests — records writes for assertion. */
class FakeCodeSyncStore(
    initialBuildNumber: Long = -1L,
) : CodeSyncStore {

    private var deviceIdValue = "3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d"
    private var buildNumber = initialBuildNumber
    private var bundleIdValue: String? = null
    private var bundlePathValue: String? = null

    var setCurrentBundleCount = 0
        private set

    override fun deviceId(): String = deviceIdValue

    override fun currentBuildNumber(): Long = buildNumber

    override fun setCurrentBundle(buildNumber: Long, bundleId: String, bundlePath: String) {
        setCurrentBundleCount++
        this.buildNumber = buildNumber
        this.bundleIdValue = bundleId
        this.bundlePathValue = bundlePath
    }

    override fun currentBundleId(): String? = bundleIdValue

    override fun currentBundlePath(): String? = bundlePathValue
}
