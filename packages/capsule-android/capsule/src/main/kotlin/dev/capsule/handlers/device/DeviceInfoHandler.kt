// Docs: docs/reference/core-api.md
package dev.capsule.handlers.device

import dev.capsule.device.DeviceInfoProvider
import dev.capsule.handlers.BridgeHandler
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.encodeToJsonElement

class DeviceInfoHandler(
    private val provider: DeviceInfoProvider,
) : BridgeHandler {

    override val method = "device.getInfo"

    override suspend fun handle(params: JsonElement): JsonElement =
        Json.encodeToJsonElement(provider.getDeviceInfo())
}
