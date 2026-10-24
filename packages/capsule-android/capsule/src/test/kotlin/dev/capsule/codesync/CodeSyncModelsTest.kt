// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pins the wire decode to the exact check-endpoint shape documented in codesync-internals.md. */
class CodeSyncModelsTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val jsonWithDefaults = Json { encodeDefaults = true }

    // Verbatim example response from docs/contributing/codesync-internals.md ("Update Check Endpoint").
    private val docExample = """
        {
          "latestBuildNumber": 47,
          "bundle": {
            "id": "6f1c2a7e-0b4d-4c1a-9e2f-3a5b6c7d8e9f",
            "version": "1.4.2",
            "buildNumber": 47,
            "rolloutPercent": 100,
            "url": "https://cdn.capsule.dev/bundles/6f1c2a7e.zip",
            "hash": "sha256:abc123def456",
            "sizeBytes": 284000,
            "mandatory": false
          }
        }
    """.trimIndent()

    @Test fun `decodes the documented check response shape`() {
        val response = json.decodeFromString<CheckResponse>(docExample)
        assertEquals(47L, response.latestBuildNumber)
        assertEquals("6f1c2a7e-0b4d-4c1a-9e2f-3a5b6c7d8e9f", response.bundle.id)
        assertEquals("1.4.2", response.bundle.version)
        assertEquals(47L, response.bundle.buildNumber)
        assertEquals(100, response.bundle.rolloutPercent)
        assertEquals(284000L, response.bundle.sizeBytes)
        assertFalse(response.bundle.mandatory)
    }

    @Test fun `sha256 prefix is stripped for verification`() {
        val response = json.decodeFromString<CheckResponse>(docExample)
        assertEquals("abc123def456", response.bundle.sha256Hex)
    }

    @Test fun `bare hex hash without prefix also decodes`() {
        val body = """{"latestBuildNumber":1,"bundle":{"id":"b","version":"1.0.0","buildNumber":1,
            "url":"https://x/b.zip","hash":"deadbeef","sizeBytes":1}}"""
        val response = json.decodeFromString<CheckResponse>(body)
        assertEquals("deadbeef", response.bundle.sha256Hex)
    }

    @Test fun `missing optional fields fall back to defaults`() {
        val body = """{"latestBuildNumber":1,"bundle":{"id":"b","version":"1.0.0","buildNumber":1,
            "url":"https://x/b.zip","hash":"sha256:aa","sizeBytes":1}}"""
        val response = json.decodeFromString<CheckResponse>(body)
        assertEquals(100, response.bundle.rolloutPercent) // rolloutPercent default
        assertFalse(response.bundle.mandatory)
    }

    @Test fun `unknown fields are ignored (forward compatibility)`() {
        val body = """{"latestBuildNumber":1,"futureField":true,"bundle":{"id":"b","version":"1.0.0",
            "buildNumber":1,"url":"https://x/b.zip","hash":"sha256:aa","sizeBytes":1,"newThing":42}}"""
        val response = json.decodeFromString<CheckResponse>(body)
        assertEquals(1L, response.latestBuildNumber)
    }

    @Test fun `garbage body fails to decode (manager maps it to an error)`() {
        var threw = false
        try {
            json.decodeFromString<CheckResponse>("<html>Not Found</html>")
        } catch (_: Exception) {
            threw = true
        }
        assertTrue(threw)
    }

    // ── Bridge DTO mapping ──────────────────────────────────────────────────────

    @Test fun `update result maps to JS status strings exactly`() {
        // Status strings must match @capsule/core's CodeSyncStatus union verbatim.
        assertEquals("idle", UpdateResult.UpToDate.toCheckResult().status)
        assertEquals("error", UpdateResult.Error("boom").toCheckResult().status)

        val ready = UpdateResult.UpdateReady("/data/bundles/x").toCheckResult()
        assertEquals("download ready", ready.status) // space, not a dash or camelCase
        assertNull(ready.update) // update details are attached by the handler
    }

    @Test fun `check result DTO serializes with JS-facing camelCase keys`() {
        val jsonText = jsonWithDefaults.encodeToString(
            CodeSyncCheckResultDTO(
                status = CodeSyncStatus.DOWNLOAD_READY,
                update = CodeSyncUpdateDTO(version = "1.4.2", buildNumber = 47),
            )
        )
        assertTrue(jsonText.contains("\"buildNumber\""))
        assertTrue(jsonText.contains("\"rolloutPercent\""))
        assertTrue(jsonText.contains("\"download ready\""))
    }
}
