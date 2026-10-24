package dev.capsule.fakes

import dev.capsule.permissions.PermissionManager

class FakePermissionManager(
    private val granted: Boolean = true
) : PermissionManager {
    override fun isGranted(vararg permissions: String) = granted
    override suspend fun request(vararg permissions: String) = granted
}
