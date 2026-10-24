// Docs: docs/concepts/architecture.md
package dev.capsule.protocol

sealed class BridgeError(val code: Int, val message: String) {
    // Protocol errors (1xxx) — same numbers as @capsule/core's errors.ts (1000 BRIDGE_UNAVAILABLE
    // is raised by the JS side only, when there is no native host).
    object ParseError     : BridgeError(1001, "PARSE_ERROR")
    object MethodNotFound : BridgeError(1002, "METHOD_NOT_FOUND")
    object InternalError  : BridgeError(1003, "INTERNAL_ERROR")

    // Permission errors (2xxx)
    object PermissionDenied : BridgeError(2001, "PERMISSION_DENIED")
    // Generic — user dismissed a system UI (camera, picker, biometric prompt, …).
    // Cross-cutting on purpose: reused by every foreground API, not camera-specific.
    object OperationCancelled : BridgeError(2002, "OPERATION_CANCELLED")

    // Location errors (3xxx)
    object LocationUnavailable : BridgeError(3001, "LOCATION_UNAVAILABLE")

    // Media errors (4xxx)
    object CameraUnavailable     : BridgeError(4001, "CAMERA_UNAVAILABLE")
    object MediaProcessingFailed : BridgeError(4002, "MEDIA_PROCESSING_FAILED")

    // Filesystem errors (5xxx)
    object FileNotFound   : BridgeError(5001, "FILE_NOT_FOUND")
    object FileIoError    : BridgeError(5002, "FILE_IO_ERROR")
    // A path that resolves outside its directory root (e.g. via "..").
    object PathNotAllowed : BridgeError(5003, "PATH_NOT_ALLOWED")

    // Push errors (6xxx). Notification permission denial reuses PermissionDenied
    // (2001), like geolocation; registration failure gets its own code. (021's
    // draft put it at 3001, which collides with LocationUnavailable — corrected to
    // the 6xxx push range, matching @capsule/core's errors.ts.)
    object PushRegistrationFailed : BridgeError(6001, "PUSH_REGISTRATION_FAILED")

    // AI errors (7xxx). Unavailable = no tier can generate on this device/build (or the model
    // still needs ai.prepare()); generation failed = a ready model errored mid-request.
    object AiUnavailable      : BridgeError(7001, "AI_UNAVAILABLE")
    object AiGenerationFailed : BridgeError(7002, "AI_GENERATION_FAILED")

    // Database errors (8xxx). (021's draft put these at 3010–3012, inside the location
    // range — moved to their own range, matching @capsule/core's errors.ts.)
    object SqlError : BridgeError(8001, "SQL_ERROR")
}
