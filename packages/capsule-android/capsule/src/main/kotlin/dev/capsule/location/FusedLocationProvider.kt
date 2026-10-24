// Docs: docs/reference/core-api.md
package dev.capsule.location

import android.content.Context
import android.location.Location
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class FusedLocationProvider(private val context: Context) : LocationProvider {

    override suspend fun getLocation(): LocationData? {
        val client = LocationServices.getFusedLocationProviderClient(context)

        val cached = suspendCancellableCoroutine<Location?> { cont ->
            client.lastLocation
                .addOnSuccessListener { cont.resume(it) }
                .addOnFailureListener { cont.resumeWithException(it) }
        }
        if (cached != null) return cached.toLocationData()

        // lastLocation is null on cold start / emulator with no prior fix — request a fresh one
        return suspendCancellableCoroutine { cont ->
            val cts = CancellationTokenSource()
            cont.invokeOnCancellation { cts.cancel() }
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { location -> cont.resume(location?.toLocationData()) }
                .addOnFailureListener { e -> cont.resumeWithException(e) }
        }
    }
}

private fun Location.toLocationData() = LocationData(
    latitude  = latitude,
    longitude = longitude,
    accuracy  = accuracy,
    altitude  = if (hasAltitude()) altitude else null,
    bearing   = if (hasBearing()) bearing else null,
    speed     = if (hasSpeed()) speed else null,
    time      = time
)
