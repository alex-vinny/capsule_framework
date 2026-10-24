// Docs: docs/reference/core-api.md
package dev.capsule.filesystem

import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError

/**
 * Platform-neutral, app-private filesystem. The Android implementation is rooted
 * at app-private storage; an iOS implementation (Phase 4) will sit behind this
 * same interface — keeping the cross-platform seam at the provider, not at the
 * `java.io.File` plumbing underneath.
 *
 * **OTA-safety (Phase-5 constraint):** every [FsDirectory] resolves *outside* the
 * OTA-swappable bundle dirs (`www/` + `server/bundle.js`, under `filesDir/bundles`)
 * so a code-push bundle swap never wipes user data written through this API.
 *
 * Implementations signal outcomes by throwing [CapsuleException]:
 *  - [BridgeError.FileNotFound]   — the path does not exist (read/stat/delete).
 *  - [BridgeError.PathNotAllowed] — the path escapes its directory root.
 *  - [BridgeError.FileIoError]    — any other I/O failure (incl. a failed download).
 */
interface FilesystemProvider {
    suspend fun readFile(directory: FsDirectory, path: String, encoding: FileEncoding): String

    /** Writes [data] and returns the file's URI. */
    suspend fun writeFile(
        directory: FsDirectory,
        path: String,
        data: String,
        encoding: FileEncoding,
        recursive: Boolean,
    ): String

    suspend fun appendFile(
        directory: FsDirectory,
        path: String,
        data: String,
        encoding: FileEncoding,
        recursive: Boolean,
    )

    suspend fun deleteFile(directory: FsDirectory, path: String)

    suspend fun mkdir(directory: FsDirectory, path: String, recursive: Boolean)

    suspend fun rmdir(directory: FsDirectory, path: String, recursive: Boolean)

    suspend fun readdir(directory: FsDirectory, path: String): List<FileEntry>

    suspend fun stat(directory: FsDirectory, path: String): FileStat

    /** Pure resolution — does not touch the filesystem. */
    fun getUri(directory: FsDirectory, path: String): String

    /** Streams [url] straight to disk (bytes never cross the JS bridge). */
    suspend fun downloadFile(
        directory: FsDirectory,
        path: String,
        url: String,
        recursive: Boolean,
    ): FileStat

    companion object {
        /** Capability name + native version for OTA gating (see CapabilityRegistry). */
        const val CAPABILITY = "filesystem"
        const val CAPABILITY_VERSION = 1
    }
}

/** Logical storage location. Mirrors `@capsule/core` `FilesystemDirectory`. */
enum class FsDirectory { DATA, CACHE, DOCUMENTS }

/** How file bytes cross the bridge. */
enum class FileEncoding { UTF8, BASE64 }

data class FileEntry(
    val name: String,
    val uri: String,
    val type: String, // "file" | "directory"
    val size: Long,
)

data class FileStat(
    val uri: String,
    val type: String, // "file" | "directory"
    val size: Long,
    val mtime: Long, // epoch millis
)
