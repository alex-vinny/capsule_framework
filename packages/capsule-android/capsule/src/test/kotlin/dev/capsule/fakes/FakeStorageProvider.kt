package dev.capsule.fakes

import dev.capsule.storage.StorageProvider

class FakeStorageProvider : StorageProvider {
    private val store = mutableMapOf<String, String>()
    override fun get(key: String) = store[key]
    override fun set(key: String, value: String) { store[key] = value }
    override fun remove(key: String) { store.remove(key) }
    override fun clear() = store.clear()
    override fun keys() = store.keys.toList()
}
