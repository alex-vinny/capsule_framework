// Docs: docs/reference/core-api.md
package dev.capsule.handlers.geolocation

import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.location.LocationData
import dev.capsule.location.LocationProvider
import dev.capsule.permissions.PermissionManager
import dev.capsule.permissions.Permissions
import dev.capsule.protocol.BridgeError
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.encodeToJsonElement

class GeolocationHandler(
    private val locationProvider: LocationProvider,
    private val permissionManager: PermissionManager
) : BridgeHandler {

    override val method = "geolocation.getCurrentPosition"

    override suspend fun handle(params: JsonElement): JsonElement {
        val granted = permissionManager.request(
            Permissions.FINE_LOCATION,
            Permissions.COARSE_LOCATION
        )
        if (!granted) throw CapsuleException(BridgeError.PermissionDenied)

        val location = locationProvider.getLocation()
            ?: throw CapsuleException(BridgeError.LocationUnavailable)

        return Json.encodeToJsonElement(location.toPosition())
    }
}

private fun LocationData.toPosition() = GeolocationPosition(
    coords = GeolocationCoords(
        latitude         = latitude,
        longitude        = longitude,
        accuracy         = accuracy.toDouble(),
        altitude         = altitude,
        altitudeAccuracy = null,
        heading          = bearing?.toDouble(),
        speed            = speed?.toDouble()
    ),
    timestamp = time
)
