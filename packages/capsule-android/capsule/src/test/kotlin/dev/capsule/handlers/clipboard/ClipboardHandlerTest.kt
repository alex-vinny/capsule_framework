// Docs: docs/reference/core-api.md
package dev.capsule.handlers.clipboard

import dev.capsule.fakes.FakeClipboardProvider
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ClipboardHandlerTest {

    @Test
    fun `read returns null when clipboard is empty`() = runTest {
        val result = ClipboardReadHandler(FakeClipboardProvider(null))
            .handle(JsonObject(emptyMap()))
        val r = Json.decodeFromJsonElement<ClipboardReadResult>(result)
        assertNull(r.value)
    }

    @Test
    fun `read returns current clipboard content`() = runTest {
        val result = ClipboardReadHandler(FakeClipboardProvider("hello"))
            .handle(JsonObject(emptyMap()))
        val r = Json.decodeFromJsonElement<ClipboardReadResult>(result)
        assertEquals("hello", r.value)
    }

    @Test
    fun `write stores text in clipboard`() = runTest {
        val fake = FakeClipboardProvider()
        ClipboardWriteHandler(fake).handle(buildJsonObject { put("text", "copied!") })
        assertEquals("copied!", fake.read())
    }

    @Test
    fun `write returns empty object`() = runTest {
        val result = ClipboardWriteHandler(FakeClipboardProvider())
            .handle(buildJsonObject { put("text", "x") })
        assertEquals(JsonObject(emptyMap()), result)
    }

    @Test
    fun `write then read round-trips`() = runTest {
        val fake = FakeClipboardProvider()
        val writer = ClipboardWriteHandler(fake)
        val reader = ClipboardReadHandler(fake)

        writer.handle(buildJsonObject { put("text", "round-trip") })
        val r = Json.decodeFromJsonElement<ClipboardReadResult>(reader.handle(JsonObject(emptyMap())))
        assertEquals("round-trip", r.value)
    }
}
