// Docs: docs/reference/core-api.md
package dev.capsule.handlers.camera

import dev.capsule.camera.CameraFacing
import dev.capsule.camera.ResultType
import dev.capsule.fakes.FakeCameraProvider
import dev.capsule.fakes.FakePermissionManager
import dev.capsule.fakes.sampleMedia
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CameraHandlerTest {

    private fun captureHandler(
        provider: FakeCameraProvider = FakeCameraProvider(),
        granted: Boolean = true,
    ) = CameraCaptureHandler(provider, FakePermissionManager(granted))

    private fun pickHandler(provider: FakeCameraProvider = FakeCameraProvider()) =
        CameraPickHandler(provider)

    private fun decode(result: kotlinx.serialization.json.JsonElement) =
        Json.decodeFromJsonElement<CameraPhoto>(result)

    // ── capturePhoto ──────────────────────────────────────────────────────────

    @Test
    fun `capturePhoto returns photo metadata from the provider`() = runTest {
        val photo = decode(captureHandler().handle(JsonObject(emptyMap())))

        assertEquals(sampleMedia.dataUrl, photo.webPath)
        assertEquals("jpeg", photo.format)
        assertEquals(1280, photo.width)
        assertEquals(960, photo.height)
        assertEquals(3L, photo.size)
    }

    @Test
    fun `capturePhoto omits dataUrl by default and includes it on request`() = runTest {
        val byDefault = decode(captureHandler().handle(JsonObject(emptyMap())))
        assertNull(byDefault.dataUrl)

        val explicit = decode(
            captureHandler().handle(buildJsonObject { put("result", "dataUrl") })
        )
        assertEquals(sampleMedia.dataUrl, explicit.dataUrl)
    }

    @Test
    fun `capturePhoto parses options and forwards them to the provider`() = runTest {
        val provider = FakeCameraProvider()
        captureHandler(provider).handle(
            buildJsonObject {
                put("quality", 0.5)
                put("facing", "front")
                put("maxWidth", 1024)
                put("maxHeight", 768)
                put("saveToGallery", true)
                put("result", "dataUrl")
            }
        )

        val opts = provider.lastCaptureOptions!!
        assertEquals(0.5, opts.quality, 0.0001)
        assertEquals(CameraFacing.FRONT, opts.facing)
        assertEquals(1024, opts.maxWidth)
        assertEquals(768, opts.maxHeight)
        assertTrue(opts.saveToGallery)
        assertEquals(ResultType.DATA_URL, opts.result)
    }

    @Test
    fun `capturePhoto applies defaults for absent options`() = runTest {
        val provider = FakeCameraProvider()
        captureHandler(provider).handle(JsonObject(emptyMap()))

        val opts = provider.lastCaptureOptions!!
        assertEquals(0.9, opts.quality, 0.0001)
        assertEquals(CameraFacing.BACK, opts.facing)
        assertNull(opts.maxWidth)
        assertEquals(ResultType.WEB_PATH, opts.result)
    }

    @Test
    fun `capturePhoto throws PERMISSION_DENIED when camera permission refused`() = runTest {
        val ex = runCatching {
            captureHandler(granted = false).handle(JsonObject(emptyMap()))
        }.exceptionOrNull() as? CapsuleException

        assertNotNull(ex)
        assertEquals(BridgeError.PermissionDenied.code, ex!!.error.code)
    }

    @Test
    fun `capturePhoto propagates OPERATION_CANCELLED from the provider`() = runTest {
        val provider = FakeCameraProvider(captureError = BridgeError.OperationCancelled)
        val ex = runCatching { captureHandler(provider).handle(JsonObject(emptyMap())) }
            .exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.OperationCancelled.code, ex!!.error.code)
    }

    @Test
    fun `capturePhoto propagates CAMERA_UNAVAILABLE from the provider`() = runTest {
        val provider = FakeCameraProvider(captureError = BridgeError.CameraUnavailable)
        val ex = runCatching { captureHandler(provider).handle(JsonObject(emptyMap())) }
            .exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.CameraUnavailable.code, ex!!.error.code)
    }

    // ── pickImage ─────────────────────────────────────────────────────────────

    @Test
    fun `pickImage needs no permission`() = runTest {
        // Even with permissions denied, picking succeeds (system photo picker grants per-pick).
        val provider = FakeCameraProvider()
        val photo = decode(pickHandler(provider).handle(JsonObject(emptyMap())))

        assertEquals(sampleMedia.dataUrl, photo.webPath)
        assertNotNull(provider.lastPickOptions)
    }

    @Test
    fun `pickImage parses options and forwards them`() = runTest {
        val provider = FakeCameraProvider()
        pickHandler(provider).handle(
            buildJsonObject {
                put("quality", 0.8)
                put("maxWidth", 640)
            }
        )

        val opts = provider.lastPickOptions!!
        assertEquals(0.8, opts.quality, 0.0001)
        assertEquals(640, opts.maxWidth)
    }

    @Test
    fun `pickImage propagates OPERATION_CANCELLED from the provider`() = runTest {
        val provider = FakeCameraProvider(pickError = BridgeError.OperationCancelled)
        val ex = runCatching { pickHandler(provider).handle(JsonObject(emptyMap())) }
            .exceptionOrNull() as? CapsuleException

        assertEquals(BridgeError.OperationCancelled.code, ex!!.error.code)
    }
}
