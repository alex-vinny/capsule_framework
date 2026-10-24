// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import com.google.common.hash.Hashing
import dev.capsule.fakes.FakeBundleStore
import dev.capsule.fakes.FakeCodeSyncStore
import dev.capsule.fakes.FakeCodeSyncTransport
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Full-flow tests for [CodeSyncManager] — check → rollout → download → verify →
 * extract → install → bookkeeping — all over fakes, no sockets, no Android runtime.
 */
class CodeSyncManagerTest {

    @get:Rule val tmp = TemporaryFolder()

    private val appId = "com.example.app"
    private val deviceId = "3f2b8c1e-7a4d-4e9b-9c1f-2d8e7a6b5c4d" // FakeCodeSyncStore default
    private val checkUrl = "https://sync.example.com/v1/check/$appId/production/1.4.0"
    private val checkinUrl = "https://sync.example.com/v1/devices/checkin"

    private lateinit var transport: FakeCodeSyncTransport
    private lateinit var store: FakeCodeSyncStore
    private lateinit var bundleStore: FakeBundleStore
    private lateinit var bundlesRoot: File
    private lateinit var manager: CodeSyncManager

    private var stagedCounter = 0

    @Before fun setUp() {
        transport = FakeCodeSyncTransport()
        store = FakeCodeSyncStore()
        bundleStore = FakeBundleStore()
        bundlesRoot = tmp.newFolder("bundles")
        manager = CodeSyncManager(
            config = CodeSyncConfig(
                url = "https://sync.example.com",
                appId = appId,
                channel = "production",
                nativeVersion = "1.4.0",
            ),
            transport = transport,
            store = store,
            bundleStore = bundleStore,
            bundlesRoot = bundlesRoot,
        )
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────────

    /**
     * Entries default to the current time (2-second DOS resolution), so two fixtures built
     * across a boundary differ byte-for-byte — and the queued zip would no longer match its hash.
     */
    private fun fixedTimeEntry(name: String) = ZipEntry(name).apply { time = 0L }

    /** Build a real bundle zip + its SHA-256 hex, and script the check + download responses. */
    private fun scriptUpdate(buildNumber: Long = 47, rolloutPercent: Int = 100): Pair<File, String> {
        val staged = tmp.newFolder("staged-$buildNumber-${++stagedCounter}")
        File(staged, "www").mkdirs()
        File(staged, "www/index.html").writeText("<!-- build $buildNumber -->")
        File(staged, "server").mkdirs()
        File(staged, "server/bundle.js").writeText("/* $buildNumber */")

        val zipFile = File(tmp.root, "bundle-$buildNumber.zip")
        ZipOutputStream(FileOutputStream(zipFile)).use { out ->
            File(staged, "www/index.html").let {
                out.putNextEntry(fixedTimeEntry("www/index.html")); out.write(it.readBytes()); out.closeEntry()
            }
            File(staged, "server/bundle.js").let {
                out.putNextEntry(fixedTimeEntry("server/bundle.js")); out.write(it.readBytes()); out.closeEntry()
            }
        }
        val zipBytes = zipFile.readBytes()
        val sha256 = Hashing.sha256().hashBytes(zipBytes).toString()

        val bundleId = "bundle-$buildNumber"
        val downloadUrl = "https://cdn.example.com/bundles/$bundleId.zip"
        val checkBody = """
            {"latestBuildNumber":$buildNumber,"bundle":{"id":"$bundleId","version":"1.4.2",
             "buildNumber":$buildNumber,"rolloutPercent":$rolloutPercent,"url":"$downloadUrl",
             "hash":"sha256:$sha256","sizeBytes":${zipBytes.size},"mandatory":false}}
        """.trimIndent()

        transport.enqueueJson(checkUrl, 200, checkBody)
        transport.enqueue(downloadUrl, 200, zipBytes)
        // Check-in endpoint gets a fire-and-forget POST.
        transport.enqueueJson(checkinUrl, 202, "{}")

        return Pair(zipFile, sha256)
    }

    // ── Happy path ───────────────────────────────────────────────────────────────

    @Test fun `new bundle in rollout downloads, verifies, and installs`() = runTest {
        scriptUpdate(buildNumber = 47)

        val result = manager.checkForUpdate()

        assertTrue(result is UpdateResult.UpdateReady)
        val path = (result as UpdateResult.UpdateReady).bundlePath
        assertTrue(File(path, "www/index.html").isFile)
        assertTrue(File(path, "server/bundle.js").isFile)
        assertEquals(1, bundleStore.installCount)
        assertEquals(47L, store.currentBuildNumber())
        assertEquals("bundle-47", store.currentBundleId())
        assertEquals(CodeSyncStatus.DOWNLOAD_READY, manager.lastStatus)
    }

    @Test fun `check and download requests hit the documented endpoints`() = runTest {
        scriptUpdate()

        manager.checkForUpdate()

        val getUrls = transport.requests.filter { it.method == "GET" }.map { it.url }
        assertEquals(listOf(checkUrl, "https://cdn.example.com/bundles/bundle-47.zip"), getUrls)
    }

    @Test fun `device check-in is posted fire-and-forget`() = runTest {
        scriptUpdate()

        manager.checkForUpdate()

        val checkin = transport.requests.first { it.method == "POST" }
        assertEquals(checkinUrl, checkin.url)
        assertTrue(checkin.body!!.contains("\"deviceId\":\"$deviceId\""))
        assertTrue(checkin.body.contains("\"platform\":\"android\""))
    }

    // ── Rollout / staleness gates ────────────────────────────────────────────────

    @Test fun `rollout percent 0 leaves the device up to date without downloading`() = runTest {
        scriptUpdate(rolloutPercent = 0)

        val result = manager.checkForUpdate()

        assertEquals(UpdateResult.UpToDate, result)
        // Only the check GET and the fire-and-forget check-in POST -- never the bundle download.
        assertEquals(2, transport.requests.size)
        assertTrue(transport.requests.none { it.url.contains("/bundles/") })
        assertEquals(0, bundleStore.installCount)
    }

    @Test fun `build number not newer than installed is up to date`() = runTest {
        store.setCurrentBundle(buildNumber = 47, bundleId = "old", bundlePath = "/old")
        scriptUpdate(buildNumber = 47) // same build → not newer

        assertEquals(UpdateResult.UpToDate, manager.checkForUpdate())
        assertEquals(0, bundleStore.installCount)
    }

    @Test fun `device outside the rollout cohort is up to date`() = runTest {
        // bucket(deviceId) = 64 → excluded at 64, included at 65.
        scriptUpdate(rolloutPercent = 64)
        assertEquals(UpdateResult.UpToDate, manager.checkForUpdate())

        scriptUpdate(rolloutPercent = 65)
        assertTrue(manager.checkForUpdate() is UpdateResult.UpdateReady)
    }

    // ── Failure paths ────────────────────────────────────────────────────────────

    @Test fun `hash mismatch rejects the bundle and installs nothing`() = runTest {
        // The WRONG check response must be consumed on this run -- scriptUpdate queues the
        // good one behind it (FIFO), so enqueue the sabotaged check AFTER the fixture and
        // rotate the queue so it comes first.
        val (zipFile, realSha) = scriptUpdate(buildNumber = 47)
        transport.enqueueJson(
            checkUrl, 200,
            """{"latestBuildNumber":47,"bundle":{"id":"bundle-47","version":"1.4.2","buildNumber":47,
                "rolloutPercent":100,"url":"https://cdn.example.com/bundles/bundle-47.zip",
                "hash":"sha256:${"0".repeat(64)}","sizeBytes":${zipFile.length()},"mandatory":false}}""",
        )

        transport.rotateCheckToFirst(checkUrl)

        val result = manager.checkForUpdate()

        assertTrue(result is UpdateResult.Error)
        assertTrue((result as UpdateResult.Error).message.contains("Hash verification failed"))
        assertEquals(0, bundleStore.installCount)
        assertEquals(-1L, store.currentBuildNumber()) // bookkeeping untouched
        assertEquals(CodeSyncStatus.ERROR, manager.lastStatus)
        assertFalse("real sha must differ from the scripted wrong one", realSha == "0".repeat(64))
    }

    @Test fun `non-200 from the check endpoint is an error`() = runTest {
        transport.enqueueJson(checkUrl, 404, "not found")

        val result = manager.checkForUpdate()

        assertTrue(result is UpdateResult.Error)
        assertTrue((result as UpdateResult.Error).message.contains("404"))
    }

    @Test fun `network failure is an error, not a crash`() = runTest {
        transport.failWith(checkUrl, java.io.IOException("airplane mode"))

        val result = manager.checkForUpdate()

        assertTrue(result is UpdateResult.Error)
        assertTrue((result as UpdateResult.Error).message.contains("airplane mode"))
    }

    @Test fun `garbage check body is an error`() = runTest {
        transport.enqueueJson(checkUrl, 200, "<html>gateway timeout</html>")

        val result = manager.checkForUpdate()

        assertTrue(result is UpdateResult.Error)
        assertTrue((result as UpdateResult.Error).message.contains("parse"))
    }

    @Test fun `download failure cleans the staging directory`() = runTest {
        val bundleId = "bundle-47"
        val downloadUrl = "https://cdn.example.com/bundles/$bundleId.zip"
        val checkBody = """
            {"latestBuildNumber":47,"bundle":{"id":"$bundleId","version":"1.4.2","buildNumber":47,
             "rolloutPercent":100,"url":"$downloadUrl","hash":"sha256:aa","sizeBytes":1,"mandatory":false}}
        """.trimIndent()
        transport.enqueueJson(checkUrl, 200, checkBody)
        transport.enqueueJson(checkinUrl, 202, "{}")
        transport.failWith(downloadUrl, java.io.IOException("CDN down"))

        val result = manager.checkForUpdate()

        assertTrue(result is UpdateResult.Error)
        assertFalse(File(bundlesRoot, bundleId).exists()) // staging cleaned
    }

    // ── URL building ─────────────────────────────────────────────────────────────

    @Test fun `check url matches the documented shape`() {
        assertEquals(
            "https://sync.example.com/v1/check/$appId/production/1.4.0",
            manager.checkUrl(),
        )
    }

    @Test fun `trailing slash in config url does not double up`() {
        val m = CodeSyncManager(
            config = CodeSyncConfig("https://sync.example.com/", appId, "production", "1.4.0"),
            transport = transport,
            store = store,
            bundleStore = bundleStore,
            bundlesRoot = bundlesRoot,
        )
        assertEquals(
            "https://sync.example.com/v1/check/$appId/production/1.4.0",
            m.checkUrl(),
        )
    }
}
