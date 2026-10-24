// Docs: docs/reference/core-api.md
package dev.capsule.device

import kotlinx.serialization.Serializable

interface DeviceInfoProvider {
    fun getDeviceInfo(): DeviceInfo
}

@Serializable
data class DeviceInfo(
    val platform: String,
    val model: String,
    val manufacturer: String,
    val osVersion: String,
    val sdkVersion: Int,
    val isVirtual: Boolean,
    val webViewVersion: String? = null,
)
