// Docs: docs/reference/core-api.md
package dev.capsule.handlers.geolocation

import dev.capsule.fakes.FakeLocationProvider
import dev.capsule.fakes.FakePermissionManager
import dev.capsule.fakes.sampleLocation
import dev.capsule.handlers.CapsuleException
import dev.capsule.location.LocationData
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class GeolocationHandlerTest {

    private fun handler(
        location: LocationData? = sampleLocation,
        granted: Boolean = true
    ) = GeolocationHandler(
        locationProvider  = FakeLocationProvider(location),
        permissionManager = FakePermissionManager(granted)
    )

    @Test
    fun `returns position with correct coords`() = runTest {
        val result   = handler().handle(JsonObject(emptyMap()))
        val position = Json.decodeFromJsonElement<GeolocationPosition>(result)

        assertEquals(-23.2522, position.coords.latitude,  0.001)
        assertEquals(-46.7495, position.coords.longitude, 0.001)
        assertEquals(10.0,     position.coords.accuracy,  0.001)
        assertNotNull(position.timestamp)
    }

    @Test
    fun `maps all optional coord fields`() = runTest {
        val loc = sampleLocation.copy(altitude = 800.0, bearing = 45f, speed = 10f)
        val result   = handler(location = loc).handle(JsonObject(emptyMap()))
        val position = Json.decodeFromJsonElement<GeolocationPosition>(result)

        assertEquals(800.0, position.coords.altitude!!, 0.001)
        assertEquals(45.0,  position.coords.heading!!,  0.001)
        assertEquals(10.0,  position.coords.speed!!,    0.001)
    }

    @Test
    fun `throws PERMISSION_DENIED when permission not granted`() = runTest {
        val ex = runCatching { handler(granted = false).handle(JsonObject(emptyMap())) }
            .exceptionOrNull() as? CapsuleException

        assertNotNull(ex)
        assertEquals(BridgeError.PermissionDenied.code,    ex!!.error.code)
        assertEquals(BridgeError.PermissionDenied.message, ex.error.message)
    }

    @Test
    fun `throws LOCATION_UNAVAILABLE when provider returns null`() = runTest {
        val ex = runCatching { handler(location = null).handle(JsonObject(emptyMap())) }
            .exceptionOrNull() as? CapsuleException

        assertNotNull(ex)
        assertEquals(BridgeError.LocationUnavailable.code,    ex!!.error.code)
        assertEquals(BridgeError.LocationUnavailable.message, ex.error.message)
    }

    @Test
    fun `location unavailable only after permission passes`() = runTest {
        // Confirm the error is about location, not permission (permission was granted)
        val ex = runCatching { handler(location = null, granted = true).handle(JsonObject(emptyMap())) }
            .exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.LocationUnavailable.code, ex!!.error.code)
    }
}
