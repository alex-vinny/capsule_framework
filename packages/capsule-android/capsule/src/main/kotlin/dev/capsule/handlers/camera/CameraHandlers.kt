// Docs: docs/reference/core-api.md
package dev.capsule.handlers.camera

import dev.capsule.camera.CameraFacing
import dev.capsule.camera.CameraProvider
import dev.capsule.camera.CaptureOptions
import dev.capsule.camera.CapturedMedia
import dev.capsule.camera.PickOptions
import dev.capsule.camera.ResultType
import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.handlers.optBool
import dev.capsule.handlers.optDouble
import dev.capsule.handlers.optInt
import dev.capsule.handlers.optString
import dev.capsule.permissions.PermissionManager
import dev.capsule.permissions.Permissions
import dev.capsule.protocol.BridgeError
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

// ─── Wire result model (mirrors @capsule/core CameraPhoto) ───────────────────

@Serializable
data class CameraPhoto(
    val webPath: String,
    val format: String,
    val width: Int,
    val height: Int,
    val size: Long,
    // Omitted from the response unless result:'dataUrl' was requested
    // (default null + encodeDefaults=false → absent on the wire).
    val dataUrl: String? = null,
)

// ─── Handlers ────────────────────────────────────────────────────────────────

class CameraCaptureHandler(
    private val provider: CameraProvider,
    private val permissionManager: PermissionManager,
) : BridgeHandler {

    override val method = "camera.capturePhoto"

    override suspend fun handle(params: JsonElement): JsonElement {
        if (!permissionManager.request(Permissions.CAMERA)) {
            throw CapsuleException(BridgeError.PermissionDenied)
        }
        val options = params.toCaptureOptions()
        val media = provider.capturePhoto(options)
        return media.toPhoto(options.result)
    }
}

class CameraPickHandler(
    private val provider: CameraProvider,
) : BridgeHandler {

    override val method = "camera.pickImage"

    // No permission gate — the system photo picker grants per-pick access.
    override suspend fun handle(params: JsonElement): JsonElement {
        val options = params.toPickOptions()
        val media = provider.pickImage(options)
        return media.toPhoto(options.result)
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun cameraHandlers(
    provider: CameraProvider,
    permissionManager: PermissionManager,
): List<BridgeHandler> =
    listOf(
        CameraCaptureHandler(provider, permissionManager),
        CameraPickHandler(provider),
    )

// ─── Mapping helpers ──────────────────────────────────────────────────────────

private fun CapturedMedia.toPhoto(result: ResultType): JsonElement {
    val photo = CameraPhoto(
        webPath = dataUrl,   // data-URL-first: webPath == the data URL until the HTTP media route lands
        format = format,
        width = width,
        height = height,
        size = size,
        dataUrl = if (result == ResultType.DATA_URL) dataUrl else null,
    )
    return Json.encodeToJsonElement(photo)
}

private fun JsonElement.toCaptureOptions(): CaptureOptions {
    val o = jsonObject
    return CaptureOptions(
        quality = o.optDouble("quality") ?: 0.9,
        facing = when (o.optString("facing")) {
            "front" -> CameraFacing.FRONT
            else -> CameraFacing.BACK
        },
        maxWidth = o.optInt("maxWidth"),
        maxHeight = o.optInt("maxHeight"),
        result = parseResult(o.optString("result")),
        saveToGallery = o.optBool("saveToGallery") ?: false,
    )
}

private fun JsonElement.toPickOptions(): PickOptions {
    val o = jsonObject
    return PickOptions(
        quality = o.optDouble("quality") ?: 0.9,
        maxWidth = o.optInt("maxWidth"),
        maxHeight = o.optInt("maxHeight"),
        result = parseResult(o.optString("result")),
    )
}

private fun parseResult(raw: String?): ResultType =
    if (raw == "dataUrl") ResultType.DATA_URL else ResultType.WEB_PATH
