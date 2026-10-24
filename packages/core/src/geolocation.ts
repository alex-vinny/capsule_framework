// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/** A location fix, shaped like the browser `GeolocationPosition`. */
export interface GeolocationPosition {
  coords: {
    /** Degrees, WGS 84. */
    latitude: number
    /** Degrees, WGS 84. */
    longitude: number
    /** Horizontal accuracy radius in metres. */
    accuracy: number
    /** Metres above the WGS 84 ellipsoid, or `null` when unknown. */
    altitude: number | null
    altitudeAccuracy: number | null
    heading: number | null
    speed: number | null
  }
  /** When the fix was taken, in milliseconds since the Unix epoch. */
  timestamp: number
}

/**
 * Options in the browser Geolocation API shape. The browser fallback honours them; the Android
 * shell currently ignores them and always asks for a high-accuracy fix.
 */
export interface GeolocationOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

const METHODS = {
  GET_CURRENT_POSITION: 'geolocation.getCurrentPosition',
  WATCH_POSITION: 'geolocation.watchPosition',
  CLEAR_WATCH: 'geolocation.clearWatch',
  POSITION_UPDATE: 'geolocation.positionUpdate',
} as const

/** Device location. Use the `geolocation` singleton; needs the location permission. */
export class GeolocationModule {
  constructor(private readonly bridge: Bridge) {}

  /** Gets one fresh location fix. Rejects with `PERMISSION_DENIED` or `LOCATION_UNAVAILABLE`. */
  getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationPosition> {
    return this.bridge.call<GeolocationPosition>(METHODS.GET_CURRENT_POSITION, options ?? {})
  }

  /**
   * Calls `callback` with each new fix until the returned function is called.
   * Only the browser fallback implements it today; in the Android shell the watch call fails and
   * the subscription is dropped (`capabilities` reports what the shell provides).
   */
  watchPosition(
    callback: (position: GeolocationPosition) => void,
    options?: GeolocationOptions
  ): () => void {
    const unsub = this.bridge.on(METHODS.POSITION_UPDATE, (params) => {
      callback(params as GeolocationPosition)
    })

    this.bridge.call(METHODS.WATCH_POSITION, options ?? {}).catch(() => unsub())

    return () => {
      unsub()
      this.bridge.call(METHODS.CLEAR_WATCH, {}).catch(() => {})
    }
  }
}
