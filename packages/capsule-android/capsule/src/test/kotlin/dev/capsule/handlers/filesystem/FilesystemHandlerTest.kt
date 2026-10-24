// Docs: docs/reference/core-api.md
package dev.capsule.handlers.filesystem

import dev.capsule.fakes.FakeFilesystemProvider
import dev.capsule.fakes.sampleStat
import dev.capsule.filesystem.FileEncoding
import dev.capsule.filesystem.FsDirectory
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FilesystemHandlerTest {

    // ── readFile ──────────────────────────────────────────────────────────────

    @Test
    fun `readFile returns data and forwards directory + encoding`() = runTest {
        val fake = FakeFilesystemProvider(readData = "hello")
        val result = FsReadFileHandler(fake).handle(
            buildJsonObject {
                put("path", "notes/a.txt")
                put("directory", "cache")
                put("encoding", "base64")
            }
        )

        assertEquals("hello", Json.decodeFromJsonElement<ReadResult>(result).data)
        assertEquals(FsDirectory.CACHE, fake.lastDirectory)
        assertEquals("notes/a.txt", fake.lastPath)
        assertEquals(FileEncoding.BASE64, fake.lastEncoding)
    }

    @Test
    fun `readFile defaults to data directory and utf8 encoding`() = runTest {
        val fake = FakeFilesystemProvider()
        FsReadFileHandler(fake).handle(buildJsonObject { put("path", "a.txt") })

        assertEquals(FsDirectory.DATA, fake.lastDirectory)
        assertEquals(FileEncoding.UTF8, fake.lastEncoding)
    }

    // ── writeFile ─────────────────────────────────────────────────────────────

    @Test
    fun `writeFile forwards data + options and returns uri`() = runTest {
        val fake = FakeFilesystemProvider(uri = "file:///data/a.txt")
        val result = FsWriteFileHandler(fake).handle(
            buildJsonObject {
                put("path", "a.txt")
                put("data", "body")
                put("encoding", "utf8")
                put("recursive", false)
            }
        )

        assertEquals("file:///data/a.txt", Json.decodeFromJsonElement<UriResult>(result).uri)
        assertEquals("body", fake.lastData)
        assertFalse(fake.lastRecursive!!)
    }

    @Test
    fun `writeFile defaults recursive to true`() = runTest {
        val fake = FakeFilesystemProvider()
        FsWriteFileHandler(fake).handle(buildJsonObject { put("path", "a.txt"); put("data", "x") })
        assertTrue(fake.lastRecursive!!)
    }

    // ── append / delete / mkdir / rmdir ────────────────────────────────────────

    @Test
    fun `appendFile returns empty object and forwards data`() = runTest {
        val fake = FakeFilesystemProvider()
        val result = FsAppendFileHandler(fake).handle(
            buildJsonObject { put("path", "log.txt"); put("data", "line") }
        )
        assertEquals(JsonObject(emptyMap()), result)
        assertEquals("line", fake.lastData)
    }

    @Test
    fun `mkdir defaults recursive true, rmdir defaults recursive false`() = runTest {
        val mk = FakeFilesystemProvider()
        FsMkdirHandler(mk).handle(buildJsonObject { put("path", "a/b") })
        assertTrue(mk.lastRecursive!!)

        val rm = FakeFilesystemProvider()
        FsRmdirHandler(rm).handle(buildJsonObject { put("path", "a/b") })
        assertFalse(rm.lastRecursive!!)
    }

    @Test
    fun `deleteFile forwards path`() = runTest {
        val fake = FakeFilesystemProvider()
        FsDeleteFileHandler(fake).handle(buildJsonObject { put("path", "a.txt") })
        assertEquals("a.txt", fake.lastPath)
    }

    // ── readdir / stat / getUri ────────────────────────────────────────────────

    @Test
    fun `readdir returns the entries list`() = runTest {
        val fake = FakeFilesystemProvider()
        val result = FsReaddirHandler(fake).handle(buildJsonObject { put("path", "") })
        val files = Json.decodeFromJsonElement<ReaddirResult>(result).files

        assertEquals(2, files.size)
        assertEquals("a.txt", files[0].name)
        assertEquals("directory", files[1].type)
    }

    @Test
    fun `stat returns size, type and mtime`() = runTest {
        val fake = FakeFilesystemProvider(stat = sampleStat)
        val result = FsStatHandler(fake).handle(buildJsonObject { put("path", "a.txt") })
        val stat = Json.decodeFromJsonElement<StatResult>(result)

        assertEquals("file", stat.type)
        assertEquals(8L, stat.size)
        assertEquals(1_700_000_000_000L, stat.mtime)
    }

    @Test
    fun `getUri returns a uri without touching the filesystem`() = runTest {
        val fake = FakeFilesystemProvider(uri = "file:///data/a.txt")
        val result = FsGetUriHandler(fake).handle(buildJsonObject { put("path", "a.txt") })
        assertEquals("file:///data/a.txt", Json.decodeFromJsonElement<UriResult>(result).uri)
    }

    // ── downloadFile ────────────────────────────────────────────────────────────

    @Test
    fun `downloadFile forwards the url and returns a stat`() = runTest {
        val fake = FakeFilesystemProvider()
        val result = FsDownloadFileHandler(fake).handle(
            buildJsonObject {
                put("url", "https://example.com/x.bin")
                put("path", "x.bin")
                put("directory", "cache")
            }
        )

        assertNotNull(Json.decodeFromJsonElement<StatResult>(result))
        assertEquals("https://example.com/x.bin", fake.lastUrl)
        assertEquals(FsDirectory.CACHE, fake.lastDirectory)
    }

    @Test
    fun `downloadFile without a url throws FILE_IO_ERROR`() = runTest {
        val fake = FakeFilesystemProvider()
        val ex = runCatching {
            FsDownloadFileHandler(fake).handle(buildJsonObject { put("path", "x.bin") })
        }.exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.FileIoError.code, ex!!.error.code)
    }

    // ── error propagation ───────────────────────────────────────────────────────

    @Test
    fun `propagates FILE_NOT_FOUND from the provider`() = runTest {
        val fake = FakeFilesystemProvider(error = BridgeError.FileNotFound)
        val ex = runCatching {
            FsReadFileHandler(fake).handle(buildJsonObject { put("path", "missing.txt") })
        }.exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.FileNotFound.code, ex!!.error.code)
    }

    @Test
    fun `propagates PATH_NOT_ALLOWED from the provider`() = runTest {
        val fake = FakeFilesystemProvider(error = BridgeError.PathNotAllowed)
        val ex = runCatching {
            FsWriteFileHandler(fake).handle(buildJsonObject { put("path", "../x"); put("data", "y") })
        }.exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.PathNotAllowed.code, ex!!.error.code)
    }
}
