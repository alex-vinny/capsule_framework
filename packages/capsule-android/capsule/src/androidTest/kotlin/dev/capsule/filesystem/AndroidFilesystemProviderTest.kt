// Docs: docs/reference/core-api.md
package dev.capsule.filesystem

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Instrumented tests for the real [AndroidFilesystemProvider] — covers path
 * resolution, the traversal guard, encoding round-trips, and the OTA-safety
 * invariant (roots live outside `filesDir/bundles`). Pure JVM can't exercise
 * `android.util.Base64` / `Uri`, so these run on a device/emulator.
 */
@RunWith(AndroidJUnit4::class)
class AndroidFilesystemProviderTest {

    private lateinit var provider: AndroidFilesystemProvider

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        // Start from a clean slate so repeated runs are deterministic.
        File(context.filesDir, "capsule/fs").deleteRecursively()
        File(context.cacheDir, "capsule/fs").deleteRecursively()
        provider = AndroidFilesystemProvider(context)
    }

    @Test
    fun writeThenReadRoundTripsUtf8() = runTest {
        provider.writeFile(FsDirectory.DATA, "notes/a.txt", "héllo", FileEncoding.UTF8, true)
        val data = provider.readFile(FsDirectory.DATA, "notes/a.txt", FileEncoding.UTF8)
        assertEquals("héllo", data)
    }

    @Test
    fun writeUtf8ReadBase64RoundTrips() = runTest {
        provider.writeFile(FsDirectory.DATA, "a.txt", "AB", FileEncoding.UTF8, true)
        val b64 = provider.readFile(FsDirectory.DATA, "a.txt", FileEncoding.BASE64)
        // base64("AB") == "QUI="
        assertEquals("QUI=", b64)
    }

    @Test
    fun appendConcatenates() = runTest {
        provider.writeFile(FsDirectory.DATA, "log.txt", "a", FileEncoding.UTF8, true)
        provider.appendFile(FsDirectory.DATA, "log.txt", "b", FileEncoding.UTF8, true)
        assertEquals("ab", provider.readFile(FsDirectory.DATA, "log.txt", FileEncoding.UTF8))
    }

    @Test
    fun readMissingThrowsFileNotFound() = runTest {
        val ex = runCatching {
            provider.readFile(FsDirectory.DATA, "nope.txt", FileEncoding.UTF8)
        }.exceptionOrNull() as? CapsuleException
        assertEquals(BridgeError.FileNotFound.code, ex!!.error.code)
    }

    @Test
    fun traversalIsRejected() = runTest {
        val ex = runCatching {
            provider.writeFile(FsDirectory.DATA, "../escape.txt", "x", FileEncoding.UTF8, true)
        }.exceptionOrNull() as? CapsuleException
        assertEquals(BridgeError.PathNotAllowed.code, ex!!.error.code)
    }

    @Test
    fun readdirListsFilesAndDirectories() = runTest {
        provider.writeFile(FsDirectory.DATA, "top.txt", "1", FileEncoding.UTF8, true)
        provider.writeFile(FsDirectory.DATA, "sub/deep.txt", "2", FileEncoding.UTF8, true)
        val entries = provider.readdir(FsDirectory.DATA, "").associate { it.name to it.type }
        assertEquals("file", entries["top.txt"])
        assertEquals("directory", entries["sub"])
    }

    @Test
    fun rmdirRefusesNonEmptyUnlessRecursive() = runTest {
        provider.writeFile(FsDirectory.DATA, "dir/f.txt", "1", FileEncoding.UTF8, true)
        val ex = runCatching {
            provider.rmdir(FsDirectory.DATA, "dir", false)
        }.exceptionOrNull() as? CapsuleException
        assertEquals(BridgeError.FileIoError.code, ex!!.error.code)

        provider.rmdir(FsDirectory.DATA, "dir", true)
        assertTrue(provider.readdir(FsDirectory.DATA, "").isEmpty())
    }

    @Test
    fun directoriesAreIsolated() = runTest {
        provider.writeFile(FsDirectory.DATA, "a.txt", "data", FileEncoding.UTF8, true)
        provider.writeFile(FsDirectory.CACHE, "a.txt", "cache", FileEncoding.UTF8, true)
        assertEquals("data", provider.readFile(FsDirectory.DATA, "a.txt", FileEncoding.UTF8))
        assertEquals("cache", provider.readFile(FsDirectory.CACHE, "a.txt", FileEncoding.UTF8))
    }

    @Test
    fun statReportsSizeAndType() = runTest {
        provider.writeFile(FsDirectory.DATA, "a.txt", "ABC", FileEncoding.UTF8, true)
        val stat = provider.stat(FsDirectory.DATA, "a.txt")
        assertEquals("file", stat.type)
        assertEquals(3L, stat.size)
    }

    @Test
    fun rootsLiveOutsideTheOtaBundleDir() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val bundles = File(context.filesDir, "bundles").canonicalPath
        for (dir in FsDirectory.values()) {
            val uri = provider.getUri(dir, "a.txt")
            assertFalse("FS root for $dir must not sit under the OTA bundle dir", uri.contains("/bundles/"))
        }
        // And the resolved data root is a sibling of (not inside) filesDir/bundles.
        val dataRoot = File(context.filesDir, "capsule/fs/data").canonicalPath
        assertFalse(dataRoot.startsWith(bundles + File.separator))
    }
}
