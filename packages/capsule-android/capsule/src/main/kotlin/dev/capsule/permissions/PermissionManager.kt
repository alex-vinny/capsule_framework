// Docs: docs/concepts/architecture.md
package dev.capsule.permissions

interface PermissionManager {
    fun isGranted(vararg permissions: String): Boolean
    suspend fun request(vararg permissions: String): Boolean
}
