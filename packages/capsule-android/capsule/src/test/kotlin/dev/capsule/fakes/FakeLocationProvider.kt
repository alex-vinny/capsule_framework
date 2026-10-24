package dev.capsule.fakes

import dev.capsule.location.LocationData
import dev.capsule.location.LocationProvider

class FakeLocationProvider(
    private val result: LocationData? = sampleLocation
) : LocationProvider {
    override suspend fun getLocation() = result
}

val sampleLocation = LocationData(
    latitude  = -23.2522,
    longitude = -46.7495,
    accuracy  = 10f,
    altitude  = null,
    bearing   = null,
    speed     = null,
    time      = 1_000L
)
