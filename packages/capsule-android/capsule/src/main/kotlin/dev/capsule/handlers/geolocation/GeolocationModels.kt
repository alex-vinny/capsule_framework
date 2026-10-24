// Docs: docs/reference/core-api.md
package dev.capsule.handlers.geolocation

import kotlinx.serialization.Serializable

@Serializable
data class GeolocationPosition(
    val coords: GeolocationCoords,
    val timestamp: Long
)

@Serializable
data class GeolocationCoords(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double,
    val altitude: Double? = null,
    val altitudeAccuracy: Double? = null,
    val heading: Double? = null,
    val speed: Double? = null
)
