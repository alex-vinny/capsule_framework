// Docs: docs/reference/core-api.md
package dev.capsule.storage

interface StorageProvider {
    fun get(key: String): String?
    fun set(key: String, value: String)
    fun remove(key: String)
    fun clear()
    fun keys(): List<String>
}
