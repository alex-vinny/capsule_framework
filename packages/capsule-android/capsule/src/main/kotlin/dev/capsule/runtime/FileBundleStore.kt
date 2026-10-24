// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

import java.io.File

/**
 * [BundleStore] backed by a directory on the local filesystem (e.g. `context.filesDir/bundles`).
 *
 * Layout under [root]:
 * ```
 * root/
 *   active/     ← currently served bundle
 *   previous/   ← last known-good bundle (rollback target)
 * ```
 *
 * The swap in [install] follows the sequence documented in codesync-internals.md
 * ("rename current → previous, new → current"): each individual [File.renameTo] is atomic, with a
 * recursive copy fallback for the rare cross-device case. A bundle is considered valid only if it
 * contains `www/index.html` — the native client's entry point.
 *
 * Uses only `java.io.File` internally; the interface exposes `String` paths so it is a literal
 * shared contract with iOS (no `java.io.File` leakage). Unit-testable on a plain JVM with a temp
 * directory, and portable to iOS via `FileManager`/`UserDefaults` equivalents.
 */
class FileBundleStore(private val root: String) : BundleStore {

    private val activePath = File(root, "active").absolutePath
    private val previousPath = File(root, "previous").absolutePath

    override fun activeDir(): String? = File(activePath).takeIf { isValidBundle(it) }?.absolutePath

    override fun install(stagedPath: String) {
        val staged = File(stagedPath)
        require(isValidBundle(staged)) {
            "staged bundle is missing www/index.html: ${staged.absolutePath}"
        }
        val rootF = File(root)
        rootF.mkdirs()

        // Demote a valid active to previous; a corrupt/absent active is simply discarded by the
        // staged move below (move clears its destination first). We never promote a bad bundle
        // to the rollback slot.
        val activeF = File(activePath)
        if (isValidBundle(activeF)) move(activeF, File(previousPath))
        move(staged, activeF)
    }

    override fun hasPrevious(): Boolean = isValidBundle(File(previousPath))

    override fun rollback(): Boolean {
        if (!isValidBundle(File(previousPath))) return false
        move(File(previousPath), File(activePath))
        return true
    }

    private fun isValidBundle(dir: File): Boolean =
        dir.isDirectory && File(dir, "www/index.html").isFile

    /** Move [from] to [to], clearing [to] first. Atomic rename, with a recursive copy fallback. */
    private fun move(from: File, to: File) {
        to.deleteRecursively()
        if (from.renameTo(to)) return
        from.copyRecursively(to, overwrite = true)
        from.deleteRecursively()
    }
}