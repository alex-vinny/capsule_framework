package dev.capsule.fakes

import dev.capsule.runtime.BundleStore

/**
 * In-memory [BundleStore] for unit tests. Tracks calls and lets a test decide whether a previous
 * bundle is available for rollback.
 *
 * Uses String paths (not java.io.File) so it matches the interface contract and is portable
 * to iOS implementations. All mutability is controlled by the test.
 */
class FakeBundleStore(
    private var hasPrevious: Boolean = false,
) : BundleStore {
    var installCount = 0
        private set
    var rollbackCount = 0
        private set
    val installed = mutableListOf<String>()

    override fun activeDir(): String? = null

    override fun install(stagedPath: String) {
        installCount++
        installed.add(stagedPath)
    }

    override fun hasPrevious(): Boolean = hasPrevious

    override fun rollback(): Boolean {
        if (!hasPrevious) return false
        rollbackCount++
        hasPrevious = false // single previous slot, consumed by rollback
        return true
    }

    fun setHasPrevious(value: Boolean) {
        hasPrevious = value
    }
}