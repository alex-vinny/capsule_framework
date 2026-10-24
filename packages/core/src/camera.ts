// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/**
 * The format the returned image bytes are encoded in.
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp'

/**
 * How the photo bytes are handed back to the caller.
 *
 * - `webPath` — a string directly usable as an `<img src>`. Today this is a
 *   `data:` URL (works in dev, browser, and embedded modes alike); a future
 *   release serves it over the embedded HTTP server (`/capsule/media/...`) so
 *   large photos stay off the JS bridge — the field name will not change.
 * - `dataUrl` — forces a base64 `data:` URL and also populates `CameraPhoto.dataUrl`.
 */
export type ResultType = 'webPath' | 'dataUrl'

export interface CameraPhoto {
  /** Directly usable as an `<img src>` (see {@link ResultType}). */
  webPath: string
  format: ImageFormat
  width: number
  height: number
  /** Size of the encoded image in bytes. */
  size: number
  /** Present only when `result: 'dataUrl'` was requested. */
  dataUrl?: string
}

export interface CaptureOptions {
  /** JPEG/WebP compression quality, 0..1. Default 0.9. */
  quality?: number
  /** Preferred lens. Best-effort — the system camera ultimately decides. Default 'back'. */
  facing?: 'front' | 'back'
  /** Downscale so the image's longest edge is at most this many pixels. */
  maxWidth?: number
  maxHeight?: number
  /** How to return the bytes. Default 'webPath'. */
  result?: ResultType
  /** Also persist the captured photo to the device gallery. Default false. */
  saveToGallery?: boolean
}

export interface PickOptions {
  /** JPEG/WebP re-compression quality, 0..1. Default 0.9. */
  quality?: number
  maxWidth?: number
  maxHeight?: number
  /** How to return the bytes. Default 'webPath'. */
  result?: ResultType
}

/** Bridge method names for the camera module — single source of truth, shared with WebBridge. */
export const CameraMethods = {
  CAPTURE_PHOTO: 'camera.capturePhoto',
  PICK_IMAGE: 'camera.pickImage',
} as const

export class CameraModule {
  constructor(private readonly bridge: Bridge) {}

  /**
   * Launch the system camera and return the captured photo. Requires the
   * `CAMERA` runtime permission — rejects with `PERMISSION_DENIED` if refused,
   * `OPERATION_CANCELLED` if the user backs out.
   */
  capturePhoto(options?: CaptureOptions): Promise<CameraPhoto> {
    return this.bridge.call<CameraPhoto>(CameraMethods.CAPTURE_PHOTO, options ?? {})
  }

  /**
   * Pick an existing image from the device. Uses the system photo picker, so it
   * needs no storage permission. Rejects with `OPERATION_CANCELLED` if dismissed.
   */
  pickImage(options?: PickOptions): Promise<CameraPhoto> {
    return this.bridge.call<CameraPhoto>(CameraMethods.PICK_IMAGE, options ?? {})
  }
}
