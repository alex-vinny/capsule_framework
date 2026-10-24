// Docs: docs/reference/core-api.md
package dev.capsule.camera

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import dev.capsule.activity.ActivityResultBroker
import dev.capsule.handlers.CapsuleException
import dev.capsule.protocol.BridgeError
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/**
 * Android [CameraProvider] — drives the system camera (TakePicture) and photo
 * picker (PickVisualMedia) through an [ActivityResultBroker], then decodes /
 * downscales / re-encodes the result to a JPEG data URL.
 *
 * Device-only: exercised by the instrumented test. The handler layer is unit-
 * tested against [dev.capsule.camera.CameraProvider] with a fake instead.
 */
class AndroidCameraProvider(
    private val context: Context,
    private val broker: ActivityResultBroker,
) : CameraProvider {

    private val authority get() = "${context.packageName}.capsule.fileprovider"

    override suspend fun capturePhoto(options: CaptureOptions): CapturedMedia {
        val file = newCacheFile()
        val target = FileProvider.getUriForFile(context, authority, file)

        val taken = try {
            broker.takePicture(target)
        } catch (e: Exception) {
            file.delete()
            throw CapsuleException(BridgeError.CameraUnavailable, e.message)
        }
        if (!taken) {
            file.delete()
            throw CapsuleException(BridgeError.OperationCancelled)
        }

        val bytes = file.readBytes().also { file.delete() }
        val media = encode(bytes, options.quality, options.maxWidth, options.maxHeight)
        if (options.saveToGallery) saveToGallery(bytes)
        return media
    }

    override suspend fun pickImage(options: PickOptions): CapturedMedia {
        val request = PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly)
            .build()

        val uri = try {
            broker.pickVisualMedia(request)
        } catch (e: Exception) {
            throw CapsuleException(BridgeError.MediaProcessingFailed, e.message)
        } ?: throw CapsuleException(BridgeError.OperationCancelled)

        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw CapsuleException(BridgeError.MediaProcessingFailed, "Could not read picked image")
        return encode(bytes, options.quality, options.maxWidth, options.maxHeight)
    }

    private fun newCacheFile(): File {
        val dir = File(context.cacheDir, "capsule/camera").apply { mkdirs() }
        return File(dir, "cap_${UUID.randomUUID()}.jpg")
    }

    // ── encoding ────────────────────────────────────────────────────────────

    private fun encode(bytes: ByteArray, quality: Double, maxWidth: Int?, maxHeight: Int?): CapturedMedia {
        val bitmap = decodeOriented(bytes, maxWidth, maxHeight)
            ?: throw CapsuleException(BridgeError.MediaProcessingFailed, "Could not decode image")

        val q = (quality.coerceIn(0.0, 1.0) * 100).toInt()
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, q, out)
        val encoded = out.toByteArray()
        val width = bitmap.width
        val height = bitmap.height
        bitmap.recycle()

        val base64 = Base64.encodeToString(encoded, Base64.NO_WRAP)
        return CapturedMedia(
            dataUrl = "data:image/jpeg;base64,$base64",
            format = "jpeg",
            width = width,
            height = height,
            size = encoded.size.toLong(),
        )
    }

    private fun decodeOriented(bytes: ByteArray, maxWidth: Int?, maxHeight: Int?): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val decodeOpts = BitmapFactory.Options().apply {
            inSampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, maxWidth, maxHeight)
        }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOpts) ?: return null

        val rotation = exifRotation(bytes)
        val scaled = scaleToFit(decoded, maxWidth, maxHeight)
        if (scaled !== decoded) decoded.recycle()

        if (rotation == 0f) return scaled
        val matrix = Matrix().apply { postRotate(rotation) }
        val rotated = Bitmap.createBitmap(scaled, 0, 0, scaled.width, scaled.height, matrix, true)
        if (rotated !== scaled) scaled.recycle()
        return rotated
    }

    private fun exifRotation(bytes: ByteArray): Float {
        return try {
            val exif = ExifInterface(ByteArrayInputStream(bytes))
            when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } catch (_: Exception) {
            0f
        }
    }

    private fun saveToGallery(bytes: ByteArray) {
        try {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "capsule_${UUID.randomUUID()}.jpg")
                put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures")
                }
            }
            val uri = context.contentResolver
                .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return
            context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
        } catch (_: Exception) {
            // Best-effort — a gallery-save failure must not fail the capture.
        }
    }
}

// ── downscale math ────────────────────────────────────────────────────────────

/** Power-of-two subsample factor so the decoded bitmap stays at/above the target. Pure — unit-tested. */
internal fun calculateInSampleSize(width: Int, height: Int, maxWidth: Int?, maxHeight: Int?): Int {
    val reqW = maxWidth ?: return 1
    val reqH = maxHeight ?: maxWidth
    var sample = 1
    var halfW = width / 2
    var halfH = height / 2
    while (halfW / sample >= reqW && halfH / sample >= reqH) sample *= 2
    return sample
}

internal fun scaleToFit(bitmap: Bitmap, maxWidth: Int?, maxHeight: Int?): Bitmap {
    val mw = maxWidth ?: Int.MAX_VALUE
    val mh = maxHeight ?: Int.MAX_VALUE
    val scale = minOf(1.0, mw.toDouble() / bitmap.width, mh.toDouble() / bitmap.height)
    if (scale >= 1.0) return bitmap
    val w = (bitmap.width * scale).toInt().coerceAtLeast(1)
    val h = (bitmap.height * scale).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(bitmap, w, h, true)
}
