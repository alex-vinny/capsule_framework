// Docs: docs/reference/core-api.md
package dev.capsule.camera

import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError

/**
 * Platform-neutral camera capability. The Android implementation drives the
 * system camera / photo picker; an iOS implementation (Phase 4) will drive
 * PHPicker / UIImagePickerController behind this same interface — keeping the
 * cross-platform seam at the provider, not at the (Android-only) Activity-result
 * plumbing it happens to use underneath.
 *
 * Implementations signal user/hardware outcomes by throwing [CapsuleException]:
 *  - [BridgeError.OperationCancelled] — user dismissed the camera/picker.
 *  - [BridgeError.CameraUnavailable]  — no camera, or the activity failed to launch.
 *  - [BridgeError.MediaProcessingFailed] — decode / downscale / encode failed.
 */
interface CameraProvider {
    /** Launch the system camera. Caller is responsible for the CAMERA permission. */
    suspend fun capturePhoto(options: CaptureOptions): CapturedMedia

    /** Pick an existing image via the system photo picker (no permission required). */
    suspend fun pickImage(options: PickOptions): CapturedMedia

    companion object {
        /** Capability name + native version for OTA gating (see CapabilityRegistry). */
        const val CAPABILITY = "camera"
        const val CAPABILITY_VERSION = 1
    }
}

/** Lens preference. Best-effort — the system camera ultimately decides. */
enum class CameraFacing { FRONT, BACK }

/** How the encoded bytes are returned to JS. */
enum class ResultType { WEB_PATH, DATA_URL }

data class CaptureOptions(
    val quality: Double = 0.9,
    val facing: CameraFacing = CameraFacing.BACK,
    val maxWidth: Int? = null,
    val maxHeight: Int? = null,
    val result: ResultType = ResultType.WEB_PATH,
    val saveToGallery: Boolean = false,
)

data class PickOptions(
    val quality: Double = 0.9,
    val maxWidth: Int? = null,
    val maxHeight: Int? = null,
    val result: ResultType = ResultType.WEB_PATH,
)

/**
 * The decoded + (optionally) downscaled image, already encoded to a transportable
 * form. [dataUrl] is always populated today (data-URL-first delivery); when the
 * embedded HTTP media route lands, [webPath] will point there instead and large
 * photos stay off the JS bridge — the contract to the handler does not change.
 */
data class CapturedMedia(
    val dataUrl: String,
    val format: String,   // "jpeg" | "png" | "webp"
    val width: Int,
    val height: Int,
    val size: Long,       // encoded byte count
)

/** Convenience for providers to signal a clean user cancellation. */
fun cancelled(): Nothing = throw CapsuleException(BridgeError.OperationCancelled)
