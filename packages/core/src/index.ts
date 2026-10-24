// Docs: docs/reference/core-api.md
/**
 * `@capsule/core` — the JavaScript API an app uses to reach the native shell.
 *
 * Each native API is a ready-made singleton (`camera`, `db`, `push`, …). Inside the Capsule
 * shell calls go over the native bridge; in a plain browser a web fallback answers instead, so an
 * app can be developed without a device. Server routes for the on-device `/api` bundle live in
 * the `@capsule/core/routes` entry point.
 *
 * @module @capsule/core
 */
import { bridge as nativeBridge } from './bridge.js'
import { WebBridge } from './web-bridge.js'
import { AlertsModule } from './alerts.js'
import { DeviceModule } from './device.js'
import { HapticsModule } from './haptics.js'
import { ClipboardModule } from './clipboard.js'
import { StorageModule } from './storage.js'
import { GeolocationModule } from './geolocation.js'
import { CameraModule } from './camera.js'
import { FilesystemModule } from './filesystem.js'
import { AppModule } from './app.js'
import { NetworkModule } from './network.js'
import { PushModule } from './push.js'
import { CapabilitiesModule } from './capabilities.js'
import { CodeSyncModule } from './codesync.js'
import { DbModule } from './db.js'
import { AiModule } from './ai.js'
import type { Bridge } from './bridge.js'

// Auto-select: native shell when available, browser fallback otherwise.
// This lets developers build and iterate in the browser without deploying
// to a device on every change.
const bridge: Bridge = typeof __capsule_host !== 'undefined' ? nativeBridge : new WebBridge()

declare const __capsule_host: unknown

// ── Singletons (public API — same shape as before) ───────────────────────────

/** Native alert dialogs: `alerts.show()` with buttons, roles and styles. */
export const alerts = new AlertsModule(bridge)
/** Device facts — `device.getInfo()` (platform, OS version, model, …). */
export const device = new DeviceModule(bridge)
/** Haptic feedback — `haptics.vibrate(style)`. */
export const haptics = new HapticsModule(bridge)
/** System clipboard — `clipboard.read()` / `clipboard.write()`. */
export const clipboard = new ClipboardModule(bridge)
/** Persistent key/value storage — `get`, `set`, `remove`, `keys`, `clear`. */
export const storage = new StorageModule(bridge)
/** Device location — `getCurrentPosition()` and `watchPosition()`. */
export const geolocation = new GeolocationModule(bridge)
/** Camera and photo library — `capturePhoto()` and `pickImage()`. */
export const camera = new CameraModule(bridge)
/** App-sandboxed files — read, write, append, stat, list, mkdir/rmdir, delete, download. */
export const filesystem = new FilesystemModule(bridge)
/** App lifecycle and deep links — state, pause/resume events, launch URL, `onUrlOpen`. */
export const app = new AppModule(bridge)
/** Connectivity — `getStatus()` and `onStatusChange()`. */
export const network = new NetworkModule(bridge)
/** Push notifications — permissions, registration token, channels, message and tap events. */
export const push = new PushModule(bridge)
/** Which native APIs (and versions) the running shell provides — `get()` / `has()`. */
export const capabilities = new CapabilitiesModule(bridge)
/** Over-the-air bundle updates — `checkForUpdate()`, `applyUpdate()`, `getStatus()`. */
export const codesync = new CodeSyncModule(bridge)
/** On-device SQLite — tagged-template `` db.sql`…` `` (values always bound), `transaction()`, `schema()`. */
export const db = new DbModule(bridge)
/** On-device AI (tiered) — `availability()`, `prepare()`, `generate()` with token streaming. */
export const ai = new AiModule(bridge)

// ── Re-exports ───────────────────────────────────────────────────────────────

export { bridge }
export type {
  AlertsModule,
  DeviceModule,
  HapticsModule,
  ClipboardModule,
  StorageModule,
  GeolocationModule,
  CameraModule,
  FilesystemModule,
  AppModule,
  NetworkModule,
  PushModule,
  CapabilitiesModule,
  CodeSyncModule,
  DbModule,
  AiModule,
}
export type { Bridge, NotificationHandler } from './bridge.js'
export { CapsuleError, CapsuleErrorCode } from './errors.js'

export type {
  AlertOptions,
  AlertResult,
  AlertButton,
  AlertButtonRole,
  AlertStyle,
} from './alerts.js'
export type { DeviceInfo } from './device.js'
export type { HapticStyle } from './haptics.js'
export type { GeolocationPosition, GeolocationOptions } from './geolocation.js'
export type { CameraPhoto, CaptureOptions, PickOptions, ImageFormat, ResultType } from './camera.js'
export type {
  FilesystemDirectory,
  DirectoryOption,
  FileEncoding,
  FileEntry,
  FileStat,
  ReadFileOptions,
  WriteFileOptions,
  MkdirOptions,
  RmdirOptions,
  DownloadFileOptions,
} from './filesystem.js'
export type { AppState, UrlOpenEvent } from './app.js'
export { AppMethods } from './app.js'
export type { NetworkStatus, ConnectionType } from './network.js'
export { NetworkMethods } from './network.js'
export type {
  PushToken,
  PushMessage,
  NotificationChannel,
  PermissionStatus,
  Unsubscribe,
} from './push.js'
export { PushMethods } from './push.js'
export type { Capabilities, CapabilityMap } from './capabilities.js'
export { CapabilitiesMethods } from './capabilities.js'
export type { CodeSyncStatus, CodeSyncUpdate, CodeSyncCheckResult } from './codesync.js'
export { CodeSyncMethods } from './codesync.js'
export type {
  SqlValue,
  SqlColumnValue,
  SqlRow,
  SqlRunResult,
  Transaction,
  Migration,
} from './db.js'
export { DbMethods } from './db.js'
export type {
  AiAvailability,
  AiTier,
  AiStatus,
  AiGenerateOptions,
  AiResult,
  AiFinishReason,
} from './ai.js'
export { AiMethods } from './ai.js'

export { FakeBridge } from './testing/fake-bridge.js'
export type { CallRecord } from './testing/fake-bridge.js'
