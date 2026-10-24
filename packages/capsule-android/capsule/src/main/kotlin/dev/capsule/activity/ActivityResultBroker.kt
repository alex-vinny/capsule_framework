// Docs: docs/concepts/architecture.md
package dev.capsule.activity

import android.net.Uri
import androidx.activity.result.PickVisualMediaRequest

/**
 * Launches system Activities that return a result, and suspends until it arrives.
 *
 * Android-only by nature (iOS has no Activity-result model — its camera provider
 * will present controllers and await delegate callbacks behind the same
 * [dev.capsule.camera.CameraProvider] seam). Reused beyond camera by any future
 * API that launches a foreground contract (document picker, contacts, share, …).
 */
interface ActivityResultBroker {
    /** Launch the system camera to write a full-res photo to [output]; true if one was taken. */
    suspend fun takePicture(output: Uri): Boolean

    /** Launch the system photo picker; returns the picked Uri, or null if dismissed. */
    suspend fun pickVisualMedia(request: PickVisualMediaRequest): Uri?
}

/**
 * Default [ActivityResultBroker] backed by Activity-owned [SuspendingActivityLauncher]s.
 * The Activity registers the contracts and binds the launchers; this class only
 * forwards the suspending calls.
 */
class AndroidActivityResultBroker(
    private val takePictureLauncher: SuspendingActivityLauncher<Uri, Boolean>,
    private val pickMediaLauncher: SuspendingActivityLauncher<PickVisualMediaRequest, Uri?>,
) : ActivityResultBroker {

    override suspend fun takePicture(output: Uri): Boolean =
        takePictureLauncher.launch(output)

    override suspend fun pickVisualMedia(request: PickVisualMediaRequest): Uri? =
        pickMediaLauncher.launch(request)
}
