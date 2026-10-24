// Docs: docs/reference/core-api.md
/**
 * Every error code the bridge can return, grouped in ranges by area (1xxx bridge, 2xxx
 * permission, 3xxx location, 4xxx media, 5xxx filesystem, 6xxx push, 7xxx AI, 8xxx database).
 * Compare a caught {@link CapsuleError}'s `code` against `CapsuleErrorCode.X.code`.
 */
export const CapsuleErrorCode = {
  // Bridge-level
  /** Not running inside the Capsule shell (no native host), so there is no bridge to call. */
  BRIDGE_UNAVAILABLE: { code: 1000, message: 'BRIDGE_UNAVAILABLE' },
  /** The native side could not parse the request. */
  PARSE_ERROR: { code: 1001, message: 'PARSE_ERROR' },
  /** No native handler is registered for the method — the shell lacks this API or version. */
  METHOD_NOT_FOUND: { code: 1002, message: 'METHOD_NOT_FOUND' },
  /** The native handler failed unexpectedly. */
  INTERNAL_ERROR: { code: 1003, message: 'INTERNAL_ERROR' },

  // Permission
  /** The user (or a policy) denied the runtime permission the call needs. */
  PERMISSION_DENIED: { code: 2001, message: 'PERMISSION_DENIED' },
  /**
   * The user dismissed a system UI (camera, picker, biometric prompt, …). Deliberately
   * cross-cutting: reused by every foreground API, not camera-specific.
   */
  OPERATION_CANCELLED: { code: 2002, message: 'OPERATION_CANCELLED' },

  // Geolocation
  /** No location fix could be obtained (services off, no signal, timeout). */
  LOCATION_UNAVAILABLE: { code: 3001, message: 'LOCATION_UNAVAILABLE' },

  // Media (camera / gallery)
  /** The device has no usable camera, or no app can take the picture. */
  CAMERA_UNAVAILABLE: { code: 4001, message: 'CAMERA_UNAVAILABLE' },
  /** The photo was taken or picked but could not be decoded, resized or encoded. */
  MEDIA_PROCESSING_FAILED: { code: 4002, message: 'MEDIA_PROCESSING_FAILED' },

  // Filesystem
  /** The path does not exist. */
  FILE_NOT_FOUND: { code: 5001, message: 'FILE_NOT_FOUND' },
  /** Reading or writing failed (disk full, not a directory, …). */
  FILE_IO_ERROR: { code: 5002, message: 'FILE_IO_ERROR' },
  /** A path that resolves outside its directory root (e.g. via `..`). */
  PATH_NOT_ALLOWED: { code: 5003, message: 'PATH_NOT_ALLOWED' },

  // Push notifications. (NOTIFICATIONS_PERMISSION_DENIED reuses PERMISSION_DENIED
  // 2001, like geolocation; registration failure needs its own code. 021's draft
  // put it at 3001, which collides with LOCATION_UNAVAILABLE — corrected to the 6xxx
  // push range here, the implementation source of truth.)
  /** Registering with the push service (FCM / APNs) failed; denial is `PERMISSION_DENIED`. */
  PUSH_REGISTRATION_FAILED: { code: 6001, message: 'PUSH_REGISTRATION_FAILED' },

  // AI. Unavailable = no tier can generate here (or the model still needs `ai.prepare()`);
  // the reason is in `data`. Generation failed = a ready model errored mid-request.
  /** No tier can generate here, or the model still needs `ai.prepare()`; the reason is in `data`. */
  AI_UNAVAILABLE: { code: 7001, message: 'AI_UNAVAILABLE' },
  /** A ready model errored mid-request. */
  AI_GENERATION_FAILED: { code: 7002, message: 'AI_GENERATION_FAILED' },

  // Database. (021's draft put these at 3010–3012 / 4010, inside the location and media
  // ranges — moved to their own 8xxx range.)
  /** SQLite rejected the statement (syntax, constraint, missing table…); details in `data`. */
  SQL_ERROR: { code: 8001, message: 'SQL_ERROR' },
  /**
   * The database's schema version is newer than every `db.schema()` the app registers
   * (e.g. an OTA rollback to an older bundle).
   */
  SCHEMA_VERSION_REGRESSION: { code: 8002, message: 'SCHEMA_VERSION_REGRESSION' },
} as const

/** The error every Capsule API rejects with: a numeric `code` from {@link CapsuleErrorCode} plus optional `data`. */
export class CapsuleError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'CapsuleError'
  }

  /** Builds the error for one {@link CapsuleErrorCode} entry. */
  static from(entry: { code: number; message: string }, data?: unknown): CapsuleError {
    return new CapsuleError(entry.code, entry.message, data)
  }
}
