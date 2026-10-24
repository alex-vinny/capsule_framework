// Docs: docs/reference/core-api.md
package dev.capsule.storage

import android.content.Context

class AndroidStorageProvider(context: Context) : StorageProvider {

    private val prefs = context.getSharedPreferences("capsule_storage", Context.MODE_PRIVATE)

    override fun get(key: String): String? = prefs.getString(key, null)

    override fun set(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }

    override fun keys(): List<String> = prefs.all.keys.toList()
}
