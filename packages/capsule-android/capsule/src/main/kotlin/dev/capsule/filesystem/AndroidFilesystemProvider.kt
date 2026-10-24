// Docs: docs/reference/core-api.md
package dev.capsule.filesystem

import android.content.Context
import android.net.Uri
import android.util.Base64
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * [FilesystemProvider] over `java.io.File`, rooted at app-private storage kept
 * *outside* the OTA bundle dirs (`filesDir/bundles`):
 *  - DATA      → `filesDir/capsule/fs/data`
 *  - CACHE     → `cacheDir/capsule/fs/cache`   (OS may reclaim under pressure)
 *  - DOCUMENTS → `filesDir/capsule/fs/documents`
 *
 * Every path is canonicalised and checked to stay within its root, so a `..`
 * traversal throws [BridgeError.PathNotAllowed] instead of escaping the sandbox.
 * Roots are created lazily by the write paths (never by reads/[getUri]). All
 * I/O runs on [Dispatchers.IO] via [io]; handlers are invoked on the main one.
 */
class AndroidFilesystemProvider(context: Context) : FilesystemProvider {

    private val appContext = context.applicationContext

    private fun root(directory: FsDirectory): File =
        when (directory) {
            FsDirectory.DATA -> File(appContext.filesDir, "capsule/fs/data")
            FsDirectory.CACHE -> File(appContext.cacheDir, "capsule/fs/cache")
            FsDirectory.DOCUMENTS -> File(appContext.filesDir, "capsule/fs/documents")
        }

    /** Resolve [path] under [directory]'s root, rejecting anything that escapes it. Pure — no I/O. */
    private fun resolve(directory: FsDirectory, path: String): File {
        val base = root(directory).canonicalFile
        val target = File(base, path).canonicalFile
        if (target.path != base.path && !target.path.startsWith(base.path + File.separator)) {
            throw CapsuleException(BridgeError.PathNotAllowed)
        }
        return target
    }

    override suspend fun readFile(directory: FsDirectory, path: String, encoding: FileEncoding): String =
        io {
            val file = resolve(directory, path)
            if (!file.exists() || file.isDirectory) throw CapsuleException(BridgeError.FileNotFound)
            when (encoding) {
                FileEncoding.UTF8 -> String(file.readBytes(), Charsets.UTF_8)
                FileEncoding.BASE64 -> Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
            }
        }

    override suspend fun writeFile(
        directory: FsDirectory,
        path: String,
        data: String,
        encoding: FileEncoding,
        recursive: Boolean,
    ): String = io {
        val file = resolve(directory, path)
        prepareParent(file, recursive)
        file.writeBytes(data.decode(encoding))
        Uri.fromFile(file).toString()
    }

    override suspend fun appendFile(
        directory: FsDirectory,
        path: String,
        data: String,
        encoding: FileEncoding,
        recursive: Boolean,
    ) = io {
        val file = resolve(directory, path)
        prepareParent(file, recursive)
        file.appendBytes(data.decode(encoding))
    }

    override suspend fun deleteFile(directory: FsDirectory, path: String) = io {
        val file = resolve(directory, path)
        if (!file.exists() || file.isDirectory) throw CapsuleException(BridgeError.FileNotFound)
        if (!file.delete()) throw CapsuleException(BridgeError.FileIoError, "delete failed")
    }

    override suspend fun mkdir(directory: FsDirectory, path: String, recursive: Boolean) = io {
        val dir = resolve(directory, path)
        val ok = if (recursive) dir.mkdirs() else dir.mkdir()
        if (!ok && !dir.isDirectory) throw CapsuleException(BridgeError.FileIoError, "mkdir failed")
    }

    override suspend fun rmdir(directory: FsDirectory, path: String, recursive: Boolean) = io {
        val dir = resolve(directory, path)
        if (!dir.exists() || !dir.isDirectory) throw CapsuleException(BridgeError.FileNotFound)
        if (!dir.listFiles().isNullOrEmpty() && !recursive) {
            throw CapsuleException(BridgeError.FileIoError, "directory not empty")
        }
        val ok = if (recursive) dir.deleteRecursively() else dir.delete()
        if (!ok) throw CapsuleException(BridgeError.FileIoError, "rmdir failed")
    }

    override suspend fun readdir(directory: FsDirectory, path: String): List<FileEntry> = io {
        val dir = resolve(directory, path)
        if (!dir.exists() || !dir.isDirectory) throw CapsuleException(BridgeError.FileNotFound)
        (dir.listFiles() ?: emptyArray()).map { it.toEntry() }
    }

    override suspend fun stat(directory: FsDirectory, path: String): FileStat = io {
        val file = resolve(directory, path)
        if (!file.exists()) throw CapsuleException(BridgeError.FileNotFound)
        file.toStat()
    }

    override fun getUri(directory: FsDirectory, path: String): String =
        Uri.fromFile(resolve(directory, path)).toString()

    override suspend fun downloadFile(
        directory: FsDirectory,
        path: String,
        url: String,
        recursive: Boolean,
    ): FileStat = io {
        val file = resolve(directory, path)
        prepareParent(file, recursive)
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
            }
            val code = conn.responseCode
            if (code !in 200..299) throw CapsuleException(BridgeError.FileIoError, "HTTP $code")
            conn.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
        } finally {
            conn?.disconnect()
        }
        file.toStat()
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    /**
     * Run a filesystem block on [Dispatchers.IO], translating failures: a
     * [CapsuleException] (FileNotFound / PathNotAllowed / a specific FileIoError)
     * passes through untouched; anything else becomes a generic FileIoError.
     */
    private suspend inline fun <T> io(crossinline block: () -> T): T =
        withContext(Dispatchers.IO) {
            try {
                block()
            } catch (e: CapsuleException) {
                throw e
            } catch (e: Exception) {
                throw CapsuleException(BridgeError.FileIoError, e.message)
            }
        }

    private fun prepareParent(file: File, recursive: Boolean) {
        val parent = file.parentFile ?: return
        if (!parent.exists()) {
            if (!recursive) throw CapsuleException(BridgeError.FileIoError, "parent does not exist")
            if (!parent.mkdirs()) throw CapsuleException(BridgeError.FileIoError, "mkdirs failed")
        }
    }

    private fun String.decode(encoding: FileEncoding): ByteArray =
        when (encoding) {
            FileEncoding.UTF8 -> toByteArray(Charsets.UTF_8)
            FileEncoding.BASE64 ->
                try {
                    Base64.decode(this, Base64.DEFAULT)
                } catch (e: IllegalArgumentException) {
                    throw CapsuleException(BridgeError.FileIoError, "invalid base64")
                }
        }

    private fun File.toEntry() =
        FileEntry(
            name = name,
            uri = Uri.fromFile(this).toString(),
            type = if (isDirectory) "directory" else "file",
            size = if (isDirectory) 0L else length(),
        )

    private fun File.toStat() =
        FileStat(
            uri = Uri.fromFile(this).toString(),
            type = if (isDirectory) "directory" else "file",
            size = if (isDirectory) 0L else length(),
            mtime = lastModified(),
        )
}
