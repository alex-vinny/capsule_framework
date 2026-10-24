package dev.capsule.fakes

import dev.capsule.device.DeviceInfo
import dev.capsule.device.DeviceInfoProvider

class FakeDeviceInfoProvider(
    private val result: DeviceInfo = sampleDeviceInfo,
) : DeviceInfoProvider {
    override fun getDeviceInfo() = result
}

val sampleDeviceInfo =
    DeviceInfo(
        platform = "android",
        model = "Test Device",
        manufacturer = "Test Corp",
        osVersion = "14",
        sdkVersion = 34,
        isVirtual = true,
        webViewVersion = "120.0.6099.144",
    )
