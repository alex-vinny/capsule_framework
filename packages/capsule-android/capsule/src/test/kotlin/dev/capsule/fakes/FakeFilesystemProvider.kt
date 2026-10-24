package dev.capsule.fakes

import dev.capsule.filesystem.FileEncoding
import dev.capsule.filesystem.FileEntry
import dev.capsule.filesystem.FileStat
import dev.capsule.filesystem.FilesystemProvider
import dev.capsule.filesystem.FsDirectory
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError

/**
 * Test double for [FilesystemProvider]. Records the arguments each call received
 * (so handler param-parsing can be asserted) and returns configurable values, or
 * throws a configured [BridgeError]. Path resolution / real I/O is the Android
 * impl's job and is covered by the instrumented provider test instead.
 */
class FakeFilesystemProvider(
    private val readData: String = "contents",
    private val uri: String = "file:///data/x",
    private val stat: FileStat = sampleStat,
    private val entries: List<FileEntry> = sampleEntries,
    private val error: BridgeError? = null,
) : FilesystemProvider {

    var lastDirectory: FsDirectory? = null; private set
    var lastPath: String? = null; private set
    var lastData: String? = null; private set
    var lastEncoding: FileEncoding? = null; private set
    var lastRecursive: Boolean? = null; private set
    var lastUrl: String? = null; private set

    private fun maybeThrow() = error?.let { throw CapsuleException(it) }

    override suspend fun readFile(directory: FsDirectory, path: String, encoding: FileEncoding): String {
        lastDirectory = directory; lastPath = path; lastEncoding = encoding
        maybeThrow()
        return readData
    }

    override suspend fun writeFile(
        directory: FsDirectory,
        path: String,
        data: String,
        encoding: FileEncoding,
        recursive: Boolean,
    ): String {
        lastDirectory = directory; lastPath = path; lastData = data
        lastEncoding = encoding; lastRecursive = recursive
        maybeThrow()
        return uri
    }

    override suspend fun appendFile(
        directory: FsDirectory,
        path: String,
        data: String,
        encoding: FileEncoding,
        recursive: Boolean,
    ) {
        lastDirectory = directory; lastPath = path; lastData = data
        lastEncoding = encoding; lastRecursive = recursive
        maybeThrow()
    }

    override suspend fun deleteFile(directory: FsDirectory, path: String) {
        lastDirectory = directory; lastPath = path
        maybeThrow()
    }

    override suspend fun mkdir(directory: FsDirectory, path: String, recursive: Boolean) {
        lastDirectory = directory; lastPath = path; lastRecursive = recursive
        maybeThrow()
    }

    override suspend fun rmdir(directory: FsDirectory, path: String, recursive: Boolean) {
        lastDirectory = directory; lastPath = path; lastRecursive = recursive
        maybeThrow()
    }

    override suspend fun readdir(directory: FsDirectory, path: String): List<FileEntry> {
        lastDirectory = directory; lastPath = path
        maybeThrow()
        return entries
    }

    override suspend fun stat(directory: FsDirectory, path: String): FileStat {
        lastDirectory = directory; lastPath = path
        maybeThrow()
        return stat
    }

    override fun getUri(directory: FsDirectory, path: String): String {
        lastDirectory = directory; lastPath = path
        maybeThrow()
        return uri
    }

    override suspend fun downloadFile(
        directory: FsDirectory,
        path: String,
        url: String,
        recursive: Boolean,
    ): FileStat {
        lastDirectory = directory; lastPath = path; lastUrl = url; lastRecursive = recursive
        maybeThrow()
        return stat
    }
}

val sampleStat = FileStat(uri = "file:///data/x", type = "file", size = 8L, mtime = 1_700_000_000_000L)

val sampleEntries = listOf(
    FileEntry(name = "a.txt", uri = "file:///data/a.txt", type = "file", size = 3L),
    FileEntry(name = "sub", uri = "file:///data/sub", type = "directory", size = 0L),
)
