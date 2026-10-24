// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

import java.io.File

/**
 * On-device storage for web/server bundles, with a two-slot model — `active` (currently served)
 * and `previous` (last known-good) — so a bad over-the-air update can be rolled back.
 *
 * A bundle is a directory containing the atomic unit deployed by `capsule build` /
 * `capsule codesync publish`:
 *
 * ```
 * <bundle>/
 *   www/index.html        ← required entry point (client bundle)
 *   www/assets/…          ← hashed JS/CSS/assets
 *   server/bundle.js      ← optional QuickJS server routes
 *   capsule-bundle.json   ← manifest
 * ```
 *
 * `www/` and `server/` are always installed together — there is no way to update one without the
 * other (see ADR / codesync-internals.md).
 */
interface BundleStore {
    /** The currently active bundle directory, or null if none is installed/valid. */
    fun activeDir(): String?  // Neutral path/URI — no java.io.File dependency

    /**
     * Atomically promote [stagedPath] to active, demoting the current active to `previous`
     * (replacing any earlier previous). [stagedPath] must be a valid bundle path (contain `www/index.html`).
     */
    fun install(stagedPath: String)

    /** True if a previous known-good bundle exists to roll back to. */
    fun hasPrevious(): Boolean

    /**
     * Restore the previous bundle as active, discarding the current (bad) active.
     * @return true if a rollback occurred, false if there was no previous bundle.
     */
    fun rollback(): Boolean
}
