// Docs: docs/concepts/primers/civetweb.md, docs/decisions/0004-web-serving-transport.md
package dev.capsule.runtime

import android.content.res.AssetManager
import java.io.IOException
import java.io.InputStream

/**
 * Static asset source for the embedded server — the seam that keeps [RequestRouter]
 * unit-testable on a plain JVM (production backs it with `AssetManager`; tests back it with a
 * map or temp dir). Returns null when the path is missing (→ 404).
 */
fun interface StaticAssets {
    /** Returns an open stream for [path] (no leading slash, e.g. `index.html`), or null. */
    fun open(path: String): InputStream?
}

/** Production source: files under `assets/www/`. Files under `assets/server/` are never exposed. */
class AssetManagerStaticAssets(
    private val assetManager: AssetManager,
    private val baseDir: String = "www",
) : StaticAssets {
    override fun open(path: String): InputStream? = try {
        assetManager.open("$baseDir/$path")
    } catch (_: IOException) {
        null
    }
}
