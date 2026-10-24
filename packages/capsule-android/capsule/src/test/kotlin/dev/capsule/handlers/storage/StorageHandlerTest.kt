// Docs: docs/reference/core-api.md
package dev.capsule.handlers.storage

import dev.capsule.fakes.FakeStorageProvider
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class StorageHandlerTest {

    private lateinit var fake: FakeStorageProvider
    private lateinit var get: StorageGetHandler
    private lateinit var set: StorageSetHandler
    private lateinit var remove: StorageRemoveHandler
    private lateinit var clear: StorageClearHandler
    private lateinit var keys: StorageKeysHandler

    @Before
    fun setUp() {
        fake = FakeStorageProvider()
        get = StorageGetHandler(fake)
        set = StorageSetHandler(fake)
        remove = StorageRemoveHandler(fake)
        clear = StorageClearHandler(fake)
        keys = StorageKeysHandler(fake)
    }

    @Test
    fun `get returns null for missing key`() = runTest {
        val result = get.handle(buildJsonObject { put("key", "missing") })
        val r = Json.decodeFromJsonElement<GetResult>(result)
        assertNull(r.value)
    }

    @Test
    fun `set then get round-trips`() = runTest {
        set.handle(buildJsonObject { put("key", "name"); put("value", "capsule") })
        val result = get.handle(buildJsonObject { put("key", "name") })
        val r = Json.decodeFromJsonElement<GetResult>(result)
        assertEquals("capsule", r.value)
    }

    @Test
    fun `remove deletes a key`() = runTest {
        set.handle(buildJsonObject { put("key", "x"); put("value", "1") })
        remove.handle(buildJsonObject { put("key", "x") })
        val r = Json.decodeFromJsonElement<GetResult>(get.handle(buildJsonObject { put("key", "x") }))
        assertNull(r.value)
    }

    @Test
    fun `clear removes all keys`() = runTest {
        set.handle(buildJsonObject { put("key", "a"); put("value", "1") })
        set.handle(buildJsonObject { put("key", "b"); put("value", "2") })
        clear.handle(JsonObject(emptyMap()))
        val r = Json.decodeFromJsonElement<KeysResult>(keys.handle(JsonObject(emptyMap())))
        assertTrue(r.keys.isEmpty())
    }

    @Test
    fun `keys returns all stored keys`() = runTest {
        set.handle(buildJsonObject { put("key", "foo"); put("value", "1") })
        set.handle(buildJsonObject { put("key", "bar"); put("value", "2") })
        val r = Json.decodeFromJsonElement<KeysResult>(keys.handle(JsonObject(emptyMap())))
        assertEquals(setOf("foo", "bar"), r.keys.toSet())
    }
}
