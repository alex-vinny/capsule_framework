// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import java.io.File
import java.io.FileInputStream
import java.util.zip.ZipInputStream

/**
 * ZIP extraction for OTA bundles — the real implementation the Android skeleton stubbed.
 *
 * Security: rejects **zip-slip** — any entry whose resolved path escapes [targetDir]
 * (absolute paths, `..` segments, symlink-style tricks) aborts the whole extraction.
 * A bundle that fails mid-way may leave partial files inside [targetDir]; callers own
 * the staging directory and delete it on failure (the manager does).
 */
object CodeSyncUnzipper {

    private val ZIP_MAGIC = byteArrayOf(0x50, 0x4B, 0x03, 0x04) // "PK\u0003\u0004"

    fun unzip(zipFile: File, targetDir: File): Boolean {
        if (!zipFile.isFile) return false
        // java.util.zip.ZipInputStream is lenient about garbage input (treats a non-zip
        // stream as an empty archive), so validate the magic explicitly.
        zipFile.inputStream().use { header ->
            val magic = ByteArray(4)
            if (header.read(magic) < 4 || !magic.contentEquals(ZIP_MAGIC)) return false
        }
        if (!targetDir.isDirectory && !targetDir.mkdirs()) return false
        val targetRoot = targetDir.canonicalPath + File.separator

        try {
            ZipInputStream(FileInputStream(zipFile)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    // Rooted names ("/abs", "\\abs", "C:\\…") resolve unpredictably per
                    // platform (on Windows a leading "/" silently drops) — reject up front.
                    if (entry.name.startsWith("/") || entry.name.startsWith("\\") ||
                        entry.name.contains(":")
                    ) return false
                    val out = File(targetDir, entry.name)
                    if (!out.canonicalPath.startsWith(targetRoot)) return false // zip-slip
                    if (entry.isDirectory) {
                        if (!out.isDirectory && !out.mkdirs()) return false
                    } else {
                        out.parentFile?.let { if (!it.isDirectory && !it.mkdirs()) return false }
                        out.outputStream().use { output -> zip.copyTo(output) }
                    }
                    zip.closeEntry()
                }
            }
        } catch (_: Exception) {
            return false
        }
        return true
    }
}
