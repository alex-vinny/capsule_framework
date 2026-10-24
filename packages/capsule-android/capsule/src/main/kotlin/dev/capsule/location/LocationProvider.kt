// Docs: docs/reference/core-api.md
package dev.capsule.location

interface LocationProvider {
    suspend fun getLocation(): LocationData?
}

data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val altitude: Double?,
    val bearing: Float?,
    val speed: Float?,
    val time: Long
)
