package dev.capsule.fakes

import dev.capsule.camera.CameraProvider
import dev.capsule.camera.CaptureOptions
import dev.capsule.camera.CapturedMedia
import dev.capsule.camera.PickOptions
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError

/**
 * Test double for [CameraProvider]. Configure success or a thrown error per call,
 * and inspect the options the handler passed through.
 */
class FakeCameraProvider(
    private val media: CapturedMedia = sampleMedia,
    private val captureError: BridgeError? = null,
    private val pickError: BridgeError? = null,
) : CameraProvider {

    var lastCaptureOptions: CaptureOptions? = null
        private set
    var lastPickOptions: PickOptions? = null
        private set

    override suspend fun capturePhoto(options: CaptureOptions): CapturedMedia {
        lastCaptureOptions = options
        captureError?.let { throw CapsuleException(it) }
        return media
    }

    override suspend fun pickImage(options: PickOptions): CapturedMedia {
        lastPickOptions = options
        pickError?.let { throw CapsuleException(it) }
        return media
    }
}

val sampleMedia = CapturedMedia(
    dataUrl = "data:image/jpeg;base64,AAAA",
    format = "jpeg",
    width = 1280,
    height = 960,
    size = 3L,
)
