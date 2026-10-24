// Docs: docs/reference/core-api.md
import type { Bridge } from './bridge.js'

/** What `device.getInfo()` reports about the device the app runs on. */
export interface DeviceInfo {
  /** Where the app is running; `web` is the browser fallback outside the shell. */
  platform: 'android' | 'ios' | 'web'
  /** Device model name, e.g. `Pixel 8` (Android `Build.MODEL`). */
  model: string
  /** Device manufacturer, e.g. `Google`. */
  manufacturer: string
  /** User-visible OS version, e.g. `15`. */
  osVersion: string
  /** Platform API level (Android `Build.VERSION.SDK_INT`). */
  sdkVersion: number
  /** `true` on an emulator or simulator. */
  isVirtual: boolean
  /** Version of the system WebView that renders the app, or `null` when it cannot be read. */
  webViewVersion: string | null
}

const METHODS = {
  GET_INFO: 'device.getInfo',
} as const

/** Device facts. Use the `device` singleton. */
export class DeviceModule {
  constructor(private readonly bridge: Bridge) {}

  /** Reads the device facts once; they do not change while the app runs. */
  getInfo(): Promise<DeviceInfo> {
    return this.bridge.call<DeviceInfo>(METHODS.GET_INFO)
  }
}
