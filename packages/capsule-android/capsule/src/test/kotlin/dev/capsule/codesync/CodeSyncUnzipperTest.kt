// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CodeSyncUnzipperTest {

    @get:Rule val tmp = TemporaryFolder()

    /** Build a zip at [zipPath] from (entryName → content) pairs. */
    private fun zip(zipPath: File, entries: Map<String, String>) {
        ZipOutputStream(FileOutputStream(zipPath)).use { out ->
            entries.forEach { (name, content) ->
                out.putNextEntry(ZipEntry(name))
                out.write(content.toByteArray())
                out.closeEntry()
            }
        }
    }

    @Test fun `extracts nested bundle structure`() {
        val zipFile = tmp.newFile("bundle.zip")
        zip(
            zipFile,
            mapOf(
                "www/index.html" to "<html></html>",
                "www/assets/main.js" to "console.log(1)",
                "server/bundle.js" to "/* routes */",
                "capsule-bundle.json" to "{}",
            ),
        )
        val target = tmp.newFolder("out")

        assertTrue(CodeSyncUnzipper.unzip(zipFile, target))

        assertEquals("<html></html>", File(target, "www/index.html").readText())
        assertEquals("console.log(1)", File(target, "www/assets/main.js").readText())
        assertEquals("/* routes */", File(target, "server/bundle.js").readText())
        assertEquals("{}", File(target, "capsule-bundle.json").readText())
    }

    @Test fun `re-extraction over an existing directory succeeds`() {
        val zipFile = tmp.newFile("bundle.zip")
        zip(zipFile, mapOf("www/index.html" to "v1"))
        val target = tmp.newFolder("out")
        assertTrue(CodeSyncUnzipper.unzip(zipFile, target))

        zip(zipFile, mapOf("www/index.html" to "v2"))
        assertTrue(CodeSyncUnzipper.unzip(zipFile, target))
        assertEquals("v2", File(target, "www/index.html").readText())
    }

    @Test fun `rejects zip-slip entries escaping the target`() {
        val zipFile = tmp.newFile("evil.zip")
        zip(
            zipFile,
            mapOf(
                "www/index.html" to "<html></html>",
                "../../evil.txt" to "pwned",
            ),
        )
        val target = tmp.newFolder("out")
        val parentMarker = File(target.parentFile, "evil.txt")

        assertFalse(CodeSyncUnzipper.unzip(zipFile, target))
        assertFalse(parentMarker.exists())
    }

    @Test fun `rejects absolute entry paths`() {
        val zipFile = tmp.newFile("evil2.zip")
        zip(zipFile, mapOf("/etc/evil.txt" to "pwned"))
        val target = tmp.newFolder("out")

        assertFalse(CodeSyncUnzipper.unzip(zipFile, target))
    }

    @Test fun `missing zip file returns false`() {
        assertFalse(CodeSyncUnzipper.unzip(File(tmp.root, "nope.zip"), tmp.newFolder("out")))
    }

    @Test fun `corrupt zip returns false`() {
        val zipFile = tmp.newFile("bad.zip")
        zipFile.writeBytes("this is not a zip".toByteArray())

        assertFalse(CodeSyncUnzipper.unzip(zipFile, tmp.newFolder("out")))
    }
}
