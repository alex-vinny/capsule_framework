// Docs: docs/contributing/codesync-internals.md
package dev.capsule.runtime

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileBundleStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    private fun store() = FileBundleStore(tmp.newFolder("bundles").absolutePath)

    /** Build a valid bundle directory with www/index.html (+ optional server/bundle.js + marker file). */
    private fun bundle(name: String): String {
        val dir = tmp.newFolder(name)
        File(dir, "www").mkdirs()
        File(dir, "www/index.html").writeText("<!-- $name -->")
        File(dir, "www/marker.txt").writeText(name)
        if (name.endsWith("v1") || name.endsWith("v2")) {
            File(dir, "server").mkdirs()
            File(dir, "server/bundle.js").writeText("/* $name */")
        }
        return dir.absolutePath
    }

    private fun markerOf(dir: String?): String? =
        dir?.takeIf { File(it, "www/marker.txt").isFile }?.let { File(it, "www/marker.txt").readText() }

    @Test fun `no bundle installed yields null active and no previous`() {
        val s = store()
        assertNull(s.activeDir())
        assertFalse(s.hasPrevious())
        assertFalse(s.rollback())
    }

    @Test fun `install makes a bundle active`() {
        val s = store()
        s.install(bundle("v1"))
        assertEquals("v1", markerOf(s.activeDir()))
        assertFalse(s.hasPrevious())
    }

    @Test fun `install carries server bundle alongside www`() {
        val s = store()
        s.install(bundle("v1"))
        val active = s.activeDir()!!
        assertTrue(File(active, "www/index.html").isFile)
        assertTrue(File(active, "server/bundle.js").isFile)
    }

    @Test fun `second install demotes the first to previous`() {
        val s = store()
        s.install(bundle("v1"))
        s.install(bundle("v2"))
        assertEquals("v2", markerOf(s.activeDir()))
        assertTrue(s.hasPrevious())
    }

    @Test fun `rollback restores the previous bundle as active`() {
        val s = store()
        s.install(bundle("v1"))
        s.install(bundle("v2"))
        assertTrue(s.rollback())
        assertEquals("v1", markerOf(s.activeDir()))
    }

    @Test fun `rollback returns false when there is no previous`() {
        val s = store()
        s.install(bundle("v1"))
        assertFalse(s.rollback())
        assertEquals("v1", markerOf(s.activeDir())) // active untouched
    }

    @Test fun `rollback consumes the previous slot`() {
        val s = store()
        s.install(bundle("v1"))
        s.install(bundle("v2"))
        assertTrue(s.rollback())
        assertFalse(s.hasPrevious())
        assertFalse(s.rollback())
    }

    @Test fun `installing rejects a bundle without www index html`() {
        val s = store()
        val bad = tmp.newFolder("bad")
        File(bad, "www").mkdirs() // no index.html
        assertThrows(IllegalArgumentException::class.java) { s.install(bad.absolutePath) }
    }

    @Test fun `three installs keep only the immediately previous bundle`() {
        val s = store()
        s.install(bundle("v1"))
        s.install(bundle("v2"))
        s.install(bundle("v3"))
        assertEquals("v3", markerOf(s.activeDir()))
        assertTrue(s.rollback())
        assertEquals("v2", markerOf(s.activeDir())) // v1 is gone
        assertFalse(s.hasPrevious())
    }

    @Test fun `store survives reconstruction over the same root`() {
        val root = tmp.newFolder("persisted")
        FileBundleStore(root.absolutePath).install(bundle("v1"))
        // A fresh instance over the same root sees the installed bundle.
        assertEquals("v1", markerOf(FileBundleStore(root.absolutePath).activeDir()))
    }
}