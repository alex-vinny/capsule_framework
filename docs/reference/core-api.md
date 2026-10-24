---
title: "Core API"
audience: app-developer
status: current
code:
  - packages/core/src/*.ts
tests:
  - packages/core/src/__tests__/**
---
# `@capsule/core` API

> The TypeScript API an app uses to reach the device: camera, files, push, the database, on-device
> AI and more. Every module is imported from `@capsule/core`.
>
> - Exact signatures, types and doc comments: **[generated core API reference](generated/core/README.md)**
>   (TypeDoc, regenerated from `packages/core/src` by `pnpm docs:gen`).
> - This page: how the API is put together, what each module covers and its platform behaviour,
>   the error codes, and the design of modules that are **planned but not built**.

---

## How it works

```typescript
import { camera, filesystem, db } from '@capsule/core'

const photo = await camera.capturePhoto({ maxWidth: 1600 })
await filesystem.writeFile('today.txt', 'Hello')
const rows = await db.sql`SELECT * FROM notes WHERE pinned = ${true}`
```

- **One bridge, three implementations.** Inside the Capsule shell, calls go to the native side
  over the JSON-RPC bridge. In a plain browser (during `vite dev`) `@capsule/core` switches to
  `WebBridge`, which maps what it can to web APIs and fails the rest with `METHOD_NOT_FOUND`.
  Tests use `FakeBridge` (exported) to script native responses.
- **Same API on the server side.** Route handlers that run in QuickJS on the device
  (`src/routes/`, `src/server/routes/`) can import the same modules; there the calls go through
  `QuickJSBridge`. See [0001-embedded-runtime.md](../decisions/0001-embedded-runtime.md) § R5.
- **Every module has the same shape:** a TypeScript module over a bridge, a native interface, a
  fake for tests, and a platform provider. The method names live in one `…Methods` constant per
  module (for example `NetworkMethods`) shared by the module and `WebBridge`.
- **Errors** are `CapsuleError` instances with a numeric `code` from `CapsuleErrorCode` and optional
  `data` (see [Error codes](#error-codes)).
- **Events** (`onStatusChange`, `onMessage`, `watchPosition`, …) return an unsubscribe function.
- **Capability check.** `capabilities.has(name, minVersion)` tells an over-the-air bundle whether the
  installed shell provides a native module at a given version, so new JS can avoid calling an API an
  older shell lacks.

---

## Modules

Built modules, as exported by `packages/core/src/index.ts`. Platform status per module is tracked
in [platform-parity.md](../contributing/platform-parity.md).

| Module | What it does | More |
|---|---|---|
| `alerts` | Native alert dialogs with custom buttons and styling (`show`). | [alerts-styling.md](../guide/alerts-styling.md) |
| `app` | App state and lifecycle (`getState`, `onStateChange`, `onResume`, `onPause`) and deep links (`getLaunchUrl`, `onUrlOpen`). | [App lifecycle](#app) |
| `camera` | Take a photo (`capturePhoto`) or pick one from the library (`pickImage`). | [Camera](#camera) |
| `capabilities` | Which native modules the installed shell provides, and at what version. | — |
| `clipboard` | Read and write plain text. | — |
| `codesync` | Over-the-air update status and manual checks. | [ota-updates.md](../guide/ota-updates.md) |
| `db` | SQLite: `sql` tagged template, `transaction`, `schema` migrations. | [database.md](../guide/database.md) |
| `device` | Platform, model, manufacturer, OS and SDK version, emulator flag, WebView version. | — |
| `filesystem` | Files in the app's `data`, `cache` and `documents` roots, plus downloads. | [Filesystem](#filesystem) |
| `geolocation` | Current position and position updates. | [Geolocation](#geolocation) |
| `haptics` | Vibration feedback (`vibrate(style)`). | [Haptics](#haptics) |
| `network` | Connection status and changes. | [Network](#network) |
| `push` | Remote notifications (FCM on Android, APNs on iOS). | [push-notifications.md](../guide/push-notifications.md) |
| `storage` | A small persistent key-value store for settings and flags. | [Storage](#storage) |
| `ai` | On-device text generation with tiered providers (`availability`, `prepare`, `generate`, `stream`). | [ai.md](../guide/ai.md) |

The route API for QuickJS handlers is a separate entry point, `@capsule/core/routes`
([Server routes](#server-routes)).

### app

`getLaunchUrl()` returns the deep link that launched the app once (consume-once), and
`onUrlOpen` reports links that arrive while it runs. `onResume`/`onPause` are shortcuts over
`onStateChange`.

### camera

Both methods resolve to a `CameraPhoto` whose `webPath` works directly as an `<img src>`; ask for
`result: 'dataUrl'` to get the bytes inline instead. `capturePhoto` asks for the camera permission
when needed. The lens choice (`facing`) is a preference; the system camera decides.

**Planned additions** (from the original design, not built): `checkPermissions`,
`requestPermissions`, multi-select in the picker, EXIF data.

### filesystem

Paths are relative to a logical root, `directory: 'data' | 'cache' | 'documents'` (default
`data`). A path that resolves outside its root, for example through `..`, fails with
`PATH_NOT_ALLOWED`. Text crosses the bridge as `utf8`, binary as `base64`. `downloadFile` saves a
URL straight to disk.

**Planned additions:** `rename`, `copy`, download progress callbacks, Android external storage.

### geolocation

`getCurrentPosition` and `watchPosition` follow the shape of the W3C Geolocation API
(`enableHighAccuracy`, `timeout`, `maximumAge`). `navigator.geolocation` also works in the
WebView; use this module when you want typed error codes.

**Planned additions:** `checkPermissions` / `requestPermissions`.

### haptics

`vibrate(style)` with `light`, `medium` (default), `heavy`, `success`, `warning`, `error` or
`selection`. On a device without a vibrator it does nothing; it never throws.

**Planned additions:** the finer-grained design (`impact`, `notification`, the `selection*`
trio, custom Android patterns).

### network

`getStatus()` returns `{ connected, connectionType }` with `connectionType` one of `wifi`,
`cellular`, `ethernet`, `none`, `unknown`. `none` always means `connected: false`; `unknown`
means connected over a transport the OS did not report. `onStatusChange` does not replay the
current state on subscribe.

- **Permissions:** Android `ACCESS_NETWORK_STATE` is declared by the CLI (a normal permission, no
  dialog). iOS needs none.
- **Native:** Android reads `ConnectivityManager` (default-network callback) behind a pure-JVM
  `NetworkProvider` seam, and a de-duplicating controller emits `network.statusChange`. iOS
  implements the same seam with `NWPathMonitor` (Phase 4). In the browser, `WebBridge` maps
  `navigator.onLine` and the `online`/`offline` events (transport `unknown` unless the Network
  Information API is present).

### storage

`get`, `set`, `remove`, `clear`, `keys` over string values, backed by `SharedPreferences` on
Android and `UserDefaults` on iOS. Use it for settings, tokens and flags; use `db` for real data.
No permissions are needed. (The original design called this module `preferences`.)

### Server routes

`@capsule/core/routes` is what `capsule build` bundles into `server/bundle.js` for QuickJS:

- `addRoute(method, handler)` overrides a JSON-RPC method with JavaScript (files in `src/routes/`);
- `addHttpRoute(path, verb, handler)` serves `/api/<path>` (files in `src/server/routes/`), with
  `CapsuleHttpRequest` in and `CapsuleHttpResponse` out.

You rarely call these directly: the CLI generates the registration code from your route files
([cli.md § capsule build](cli.md#capsule-build)).

---

## Error codes

The registry is `CapsuleErrorCode` in `packages/core/src/errors.ts`, mirrored by the Kotlin
`BridgeError`. Bridge implementations must use these codes exactly. Each module gets its own
range; the generic codes are shared.

| Code | Name | When |
|---|---|---|
| 1000 | `BRIDGE_UNAVAILABLE` | No native bridge to talk to. |
| 1001 | `PARSE_ERROR` | A request or response could not be parsed. |
| 1002 | `METHOD_NOT_FOUND` | No handler for the method (also: a module the shell or browser lacks). |
| 1003 | `INTERNAL_ERROR` | Unexpected failure on the native side. |
| 2001 | `PERMISSION_DENIED` | A runtime permission was refused (camera, location, …). |
| 2002 | `OPERATION_CANCELLED` | The user dismissed a system UI (camera, picker, …). |
| 3001 | `LOCATION_UNAVAILABLE` | No position could be obtained. |
| 4001 | `CAMERA_UNAVAILABLE` | No camera, or it could not be opened. |
| 4002 | `MEDIA_PROCESSING_FAILED` | Encoding or resizing the image failed. |
| 5001 | `FILE_NOT_FOUND` | The path does not exist. |
| 5002 | `FILE_IO_ERROR` | Reading or writing failed. |
| 5003 | `PATH_NOT_ALLOWED` | The path resolves outside its directory root. |
| 6001 | `PUSH_REGISTRATION_FAILED` | FCM/APNs registration failed. |
| 7001 | `AI_UNAVAILABLE` | No AI tier can generate here, or the model needs `ai.prepare()`; the reason is in `data`. |
| 7002 | `AI_GENERATION_FAILED` | A ready model failed mid-request. |
| 8001 | `SQL_ERROR` | SQLite rejected the statement; details in `data`. |
| 8002 | `SCHEMA_VERSION_REGRESSION` | The stored schema is newer than every `db.schema()` the app registers (e.g. after an OTA rollback). |

Which module raises what:

| Module | Codes |
|---|---|
| camera | 2001, 2002, 4001, 4002 |
| geolocation | 2001, 3001 |
| filesystem | 5001, 5002, 5003 |
| push | 6001 (permission is reported as a status by `checkPermissions`/`requestPermissions`, not as an error) |
| ai | 1001, 7001, 7002 |
| db | 8001, 8002 |
| any | 1000–1003 |

New modules take the next free range, the way push (6xxx), AI (7xxx) and the database (8xxx) did.
The planned modules below still carry draft codes from the original design; those numbers collide
with the ranges above and will be reassigned when each module is built.

---

## Planned modules (design spec)

Everything from here on is **design, not built**: none of these modules is exported from
`@capsule/core` today. The interfaces are the target contract for when each module is
implemented, and they change when the build teaches us something (as `network`, `push`, `db` and
`camera` did). Error-code numbers in these sections are drafts (see above).

The shared types these designs use:

```typescript
/** Permission status, aligned with the W3C Permissions API (built: exported from push). */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'prompt'                  // first request: the system dialog will appear
  | 'prompt-with-rationale'   // Android: denied once, show a rationale before asking again

/** Returned by all event listeners and position watchers. Call it to stop. */
export type Unsubscribe = () => void
```

---

### biometrics

```typescript
export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none'

export interface BiometricAvailability {
  isAvailable: boolean
  biometryType: BiometricType
  /** Why biometrics are unavailable, if applicable */
  reason?: 'NOT_ENROLLED' | 'HARDWARE_UNAVAILABLE' | 'LOCKED_OUT' | 'UNSUPPORTED'
}

export interface AuthenticateOptions {
  /** Reason string shown in the system prompt */
  reason: string
  /** Fallback button label. Set to '' to hide the button. Default: 'Use Passcode' */
  fallbackTitle?: string
  /** Cancel button label. Default: 'Cancel' */
  cancelTitle?: string
  /** Allow device PIN/password as fallback. Default: true */
  allowDeviceCredential?: boolean
}

export declare const biometrics: {
  checkAvailability(): Promise<BiometricAvailability>
  /** Prompt biometric authentication. Resolves on success, rejects on failure. */
  authenticate(options: AuthenticateOptions): Promise<void>
}
```

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 3001 | `BIOMETRICS_UNAVAILABLE` | No hardware or not enrolled |
| 3002 | `BIOMETRICS_LOCKED_OUT` | Too many failed attempts |
| 4001 | `BIOMETRICS_FAILED` | Authentication failed |
| 5001 | `BIOMETRICS_CANCELLED` | User tapped Cancel or pressed back |
| 5002 | `BIOMETRICS_FALLBACK` | User tapped the fallback (passcode) button |

---

### microphone

```typescript
export type AudioFormat = 'aac' | 'mp4' | 'wav'

export interface RecordOptions {
  /** Stop recording automatically after this many milliseconds */
  durationLimit?: number
  format?: AudioFormat           // Default: 'aac'
  sampleRate?: number            // Default: 44100
  bitRate?: number               // Default: 128000
}

export interface RecordingResult {
  path: string
  webPath: string
  durationMs: number
  mimeType: string
}

export declare const microphone: {
  startRecording(options?: RecordOptions): Promise<void>
  stopRecording(): Promise<RecordingResult>
  pauseRecording(): Promise<void>
  resumeRecording(): Promise<void>
  getStatus(): Promise<{ isRecording: boolean; isPaused: boolean; durationMs: number }>
  checkPermissions(): Promise<{ microphone: PermissionStatus }>
  requestPermissions(): Promise<{ microphone: PermissionStatus }>
}
```

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 2001 | `MICROPHONE_PERMISSION_DENIED` | Permission not granted |
| 3001 | `RECORDING_IN_PROGRESS` | `startRecording` called while already recording |
| 3002 | `NO_ACTIVE_RECORDING` | `stopRecording`/`pause` called with no active session |

---

### barcode

```typescript
export type BarcodeFormat =
  | 'QR_CODE' | 'DATA_MATRIX' | 'AZTEC' | 'PDF_417'    // 2D
  | 'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E'             // retail
  | 'CODE_128' | 'CODE_39' | 'CODE_93' | 'ITF' | 'CODABAR' // linear

export interface BarcodeResult {
  value: string
  format: BarcodeFormat
  /** Bounding box in camera preview, normalised 0.0–1.0. Only present when scanned live. */
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface BarcodeScanOptions {
  /** Limit detection to specific formats for speed. Default: all formats */
  formats?: BarcodeFormat[]
  /** Show native camera viewfinder UI. Default: true */
  showUI?: boolean
}

export declare const barcode: {
  /** Open the native scanner UI and resolve when a code is detected. */
  scan(options?: BarcodeScanOptions): Promise<BarcodeResult>
  /** Detect barcodes in a static image (file:// or http://localhost/ URI). */
  scanImage(options: { path: string; formats?: BarcodeFormat[] }): Promise<BarcodeResult[]>
  checkPermissions(): Promise<{ camera: PermissionStatus }>
  requestPermissions(): Promise<{ camera: PermissionStatus }>
}
```

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 2001 | `CAMERA_PERMISSION_DENIED` | Permission not granted |
| 5001 | `SCAN_CANCELLED` | User dismissed the scanner UI |

---

### share

```typescript
export interface ShareOptions {
  title?: string
  text?: string
  url?: string
  /** file:// URIs to include as attachments */
  files?: string[]
  /** Title for the share sheet dialog (Android only) */
  dialogTitle?: string
}

export interface ShareResult {
  /** App the user shared to, if the OS reports it. May be undefined. */
  activityType?: string
}

export declare const share: {
  share(options: ShareOptions): Promise<ShareResult>
  /** Check if the share sheet is supported (always true on mobile, false on web) */
  canShare(): Promise<{ value: boolean }>
}
```

---

### battery

```typescript
export interface BatteryInfo {
  batteryLevel: number          // 0.0–1.0
  isCharging: boolean
  chargingType?: 'ac' | 'usb' | 'wireless' | 'unknown'  // Android only
}

export declare const battery: {
  getInfo(): Promise<BatteryInfo>
  /** Subscribe to battery status changes. Returns an unsubscribe function. */
  onChange(handler: (info: BatteryInfo) => void): Unsubscribe
}
```

---

### screenOrientation

```typescript
export type OrientationType =
  | 'portrait'
  | 'portrait-secondary'      // upside-down
  | 'landscape'               // home button / camera on right
  | 'landscape-secondary'     // home button / camera on left
  | 'unknown'

export type LockOrientation = 'portrait' | 'landscape' | 'portrait-secondary' | 'landscape-secondary'

export declare const screenOrientation: {
  orientation(): Promise<{ type: OrientationType }>
  lock(orientation: LockOrientation): Promise<void>
  unlock(): Promise<void>
  /** Subscribe to orientation changes. Returns an unsubscribe function. */
  onChange(handler: (orientation: { type: OrientationType }) => void): Unsubscribe
}
```

---

### motion

Accelerometer and gyroscope combined into a single capability to avoid redundant permission requests.

```typescript
export interface MotionReading {
  /** Acceleration including gravity, in m/s² */
  acceleration: { x: number; y: number; z: number }
  /** Acceleration with gravity removed */
  accelerationWithoutGravity: { x: number; y: number; z: number }
  /** Rotation rate in rad/s. null if device has no gyroscope. */
  rotationRate: { alpha: number; beta: number; gamma: number } | null
  timestamp: number
}

export declare const motion: {
  isAvailable(): Promise<{ accelerometer: boolean; gyroscope: boolean }>
  /** Start receiving motion updates. Returns an unsubscribe function. */
  watchMotion(
    options: { sampleIntervalMs?: number },    // Default: 100ms
    callback: (data: MotionReading) => void
  ): Unsubscribe
}
```

---

### nfc

```typescript
export type NfcTechType =
  | 'NDEF' | 'ISO_DEP' | 'MIFARE_CLASSIC' | 'MIFARE_ULTRALIGHT'
  | 'NFC_A' | 'NFC_B' | 'NFC_F' | 'NFC_V'

export interface NdefRecord {
  tnf: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7   // Type Name Format byte
  type: Uint8Array
  id: Uint8Array
  payload: Uint8Array
}

export interface NfcTag {
  /** Tag UID as hex string: 'A1B2C3D4' */
  id: string
  techTypes: NfcTechType[]
  ndefMessage?: NdefRecord[]
  maxNdefSize?: number
  isWritable?: boolean
}

export declare const nfc: {
  isAvailable(): Promise<{ available: boolean; enabled: boolean }>
  /** Start scanning. Resolves when a tag enters range. */
  scan(options?: { timeout?: number; techTypes?: NfcTechType[] }): Promise<NfcTag>
  /** Write NDEF records to the tag found in the most recent scan(). */
  write(records: NdefRecord[]): Promise<void>
  /** Make the tag read-only. Irreversible. */
  makeReadOnly(): Promise<void>
  checkPermissions(): Promise<{ nfc: PermissionStatus }>
  requestPermissions(): Promise<{ nfc: PermissionStatus }>
}
```

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 3001 | `NFC_UNAVAILABLE` | No NFC hardware |
| 3002 | `NFC_DISABLED` | Hardware present but disabled in settings |
| 3003 | `TAG_LOST` | Tag left range during operation |
| 3004 | `TAG_NOT_WRITABLE` | Tag is read-only |
| 3005 | `NDEF_NOT_SUPPORTED` | Tag does not support NDEF format |
| 3006 | `NDEF_TOO_LARGE` | Message exceeds tag capacity |
| 3007 | `SCAN_TIMEOUT` | No tag found within `timeout` ms |

---

### bluetooth

```typescript
export interface BleDevice {
  deviceId: string
  name?: string
  rssi?: number
  /** Advertised service UUIDs (128-bit, lowercase hyphenated) */
  serviceUuids?: string[]
  manufacturerData?: Record<number, DataView>
}

export interface BleScanOptions {
  services?: string[]       // Filter by UUID — strongly recommended
  timeout?: number          // Stop scan after N ms
  allowDuplicates?: boolean // Default: false
}

export interface BleCharacteristic {
  uuid: string
  properties: {
    read: boolean
    write: boolean
    writeWithoutResponse: boolean
    notify: boolean
    indicate: boolean
  }
}

export interface BleService {
  uuid: string
  characteristics: BleCharacteristic[]
}

export interface BlePermissions {
  bluetooth: PermissionStatus
  bluetoothScan: PermissionStatus     // Android 12+ separate permission
  bluetoothConnect: PermissionStatus  // Android 12+ separate permission
}

export declare const bluetooth: {
  isAvailable(): Promise<{ available: boolean }>
  /** Android only — prompt user to enable Bluetooth. Rejects if denied. */
  requestEnable(): Promise<void>
  /** Scan for BLE peripherals. Returns an unsubscribe function that also stops the scan. */
  startScan(options: BleScanOptions, onDevice: (device: BleDevice) => void): Unsubscribe
  connect(deviceId: string): Promise<void>
  disconnect(deviceId: string): Promise<void>
  discoverServices(deviceId: string): Promise<{ services: BleService[] }>
  read(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<DataView>
  write(deviceId: string, serviceUuid: string, characteristicUuid: string, data: DataView): Promise<void>
  writeWithoutResponse(deviceId: string, serviceUuid: string, characteristicUuid: string, data: DataView): Promise<void>
  /** Subscribe to characteristic notifications. Returns an unsubscribe function. */
  startNotifications(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    handler: (data: DataView) => void
  ): Unsubscribe
  /** Subscribe to connection state changes for a device. */
  onConnectionStateChange(
    deviceId: string,
    handler: (state: { deviceId: string; connected: boolean }) => void
  ): Unsubscribe
  checkPermissions(): Promise<BlePermissions>
  requestPermissions(): Promise<BlePermissions>
}
```

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 2001 | `BLUETOOTH_PERMISSION_DENIED` | Scan/connect permission not granted |
| 3001 | `BLUETOOTH_UNAVAILABLE` | No Bluetooth hardware |
| 3002 | `BLUETOOTH_DISABLED` | Hardware present but off |
| 3003 | `DEVICE_NOT_CONNECTED` | Operation on disconnected peripheral |
| 3004 | `CHARACTERISTIC_NOT_FOUND` | UUID not found on device |
| 3005 | `GATT_ERROR` | Low-level GATT communication failure |

---

### navigation

```typescript
export interface BackButtonEvent {
  /** true if window.history.length > 1 */
  canGoBack: boolean
}

export declare const navigation: {
  /**
   * Override the Android hardware back button.
   * The provided handler replaces the default shell behavior for back presses.
   * Returns an unsubscribe function.
   */
  onBackButton(handler: (event: BackButtonEvent) => void): Unsubscribe
  /** Programmatic back navigation — calls window.history.back() and fires popstate. */
  goBack(): void
}
```

> **Default shell behavior (built, Android):** the back button calls `WebView.goBack()` when the WebView has history, which fires `popstate`, so SPA routers handle it with no code. With no history it falls through to the system back action and leaves the app.
> **Planned:** the `navigation` module above, and a `capsule:backbutton` event dispatched on `window` when there is no history. See Q11 in `../decisions/log.md`.

---

### codesync (planned additions)

Built today: `checkForUpdate`, `getStatus`, `applyUpdate` (see [ota-updates.md](../guide/ota-updates.md)). The design below adds device metadata, the current-bundle query and an explicit reload; note its `checkForUpdate` signature differs from the built one.

```typescript
export interface BundleInfo {
  id: string
  /** Canonical version: '{appVersion}+{bundlePatch}' e.g. '1.0.0+3' */
  version: string
  downloadedAt: number   // ms timestamp
}

export interface DeviceMetadata {
  [key: string]: string | number | boolean
}

export declare const codesync: {
  /**
   * Register custom device metadata sent on every check-in.
   * Call after user authentication when business context is known.
   * No PII — use opaque identifiers (tier, group, store_id), not email or name.
   */
  setDeviceMetadata(metadata: DeviceMetadata): Promise<void>
  /** Returns the currently active OTA bundle, or null if running the store build. */
  getCurrentBundle(): Promise<BundleInfo | null>
  /** Manually trigger an update check outside the normal foreground trigger. */
  checkForUpdate(): Promise<void>
  /** Immediately reload the web layer to apply a downloaded bundle. */
  reload(): Promise<void>
}
```

---

### db (planned additions)

Built today: `db.sql`, `db.transaction`, `db.schema` ([database.md](../guide/database.md)). The design below adds a zero-SQL collection API on the same database file, and encrypted databases. Collections would also be usable inside `db.transaction()` (`tx.collection(…)`).

#### `db.collection<T>()` — CRUD without SQL

Collections auto-create and auto-migrate their table. No `CREATE TABLE`, no migration files for simple schemas.

```typescript
import { db } from '@capsule/core'

interface Note {
  id:     string   // auto UUID if omitted on insert
  title:  string
  body:   string
  pinned: boolean
  ts:     number
}

const notes = db.collection<Note>('notes')

// Insert — id is auto-generated if not provided
const note = await notes.add({ title: 'Hello', body: 'World', pinned: false, ts: Date.now() })

// Read
const one  = await notes.get(note.id)
const all  = await notes.getAll()

// Query builder — chainable
const pinned = await notes
  .where('pinned').eq(true)
  .orderBy('ts', 'desc')
  .limit(20)
  .getAll()

const recent = await notes
  .where('ts').gt(Date.now() - 86400_000)
  .orderBy('ts', 'desc')
  .getAll()

// Update / delete
await notes.update(note.id, { title: 'Updated' })
await notes.remove(note.id)
await notes.removeWhere('pinned', false)

// Sync helpers — get local changes since a timestamp, apply server changes
const changes = await notes.changesSince(lastSyncAt)   // { added, updated, removed }
await notes.applyChanges(serverChanges)                // server-authoritative apply
```

```typescript
export interface CollectionHandle<T extends { id: string }> {
  add(row: Omit<T, 'id'> & { id?: string }): Promise<T>
  get(id: string): Promise<T | null>
  getAll(): Promise<T[]>
  where<K extends keyof T>(field: K): WhereClause<T>
  update(id: string, patch: Partial<Omit<T, 'id'>>): Promise<void>
  remove(id: string): Promise<void>
  removeWhere<K extends keyof T>(field: K, value: T[K]): Promise<void>
  changesSince(since: Date | number): Promise<CollectionChanges<T>>
  applyChanges(changes: CollectionChanges<T>): Promise<void>
  count(): Promise<number>
}

export interface WhereClause<T> {
  eq(value: unknown): QueryBuilder<T>
  gt(value: unknown): QueryBuilder<T>
  lt(value: unknown): QueryBuilder<T>
  gte(value: unknown): QueryBuilder<T>
  lte(value: unknown): QueryBuilder<T>
  like(pattern: string): QueryBuilder<T>
}

export interface QueryBuilder<T> {
  and<K extends keyof T>(field: K): WhereClause<T>
  orderBy(field: keyof T, direction?: 'asc' | 'desc'): QueryBuilder<T>
  limit(n: number): QueryBuilder<T>
  offset(n: number): QueryBuilder<T>
  getAll(): Promise<T[]>
  getFirst(): Promise<T | null>
  count(): Promise<number>
}

export interface CollectionChanges<T> {
  added:   T[]
  updated: T[]
  removed: string[]  // ids
}
```

#### Encrypted database — `database.open()`

For sensitive data. Same combined API (collection + sql), encrypted at rest via SQLCipher.
Developer supplies the key — Capsule never derives or stores it.

```typescript
import { database } from '@capsule/core'

// Derive or retrieve your key — e.g. from biometrics or secure preferences
const key = await biometrics.getKey('db-encryption-key')

const secureDb = await database.open('secure', { key })

// Same API — collection and sql both available, encrypted
const secrets = secureDb.collection<Secret>('secrets')
await secrets.add({ label: 'token', value: '...' })

const rows = await secureDb.sql<Secret[]>`SELECT * FROM secrets`

await secureDb.close()
```

```typescript
export declare const database: {
  open(name: string, options?: { key?: string | ArrayBuffer; journalMode?: 'DELETE' | 'WAL' | 'MEMORY' }): Promise<DatabaseInstance>
}

export interface DatabaseInstance {
  collection<T extends { id: string }>(name: string): CollectionHandle<T>
  sql: TaggedSql
  schema(version: number, fn: (tx: SchemaTransaction) => Promise<void>): void
  transaction(fn: (tx: TransactionHandle) => Promise<void>): Promise<void>
  close(): Promise<void>
}
```

---

### notifications (local)

Schedule future notifications that fire at an exact time — even when the app is closed. No server required. This is distinct from `push` (server-triggered FCM/APNs). Local notifications are scheduled by the app itself, fired by the OS alarm system.

> **Permission required.** Both platforms require explicit user consent. Always call `notifications.requestPermission()` before scheduling.

```typescript
import { notifications } from '@capsule/core'

// Request permission (prompt appears once; subsequent calls return current status)
const status = await notifications.requestPermission()
if (status !== 'granted') return

// Schedule a notification at an exact future time
await notifications.schedule({
  id:    'schedule-meeting-123',           // stable id — used to cancel/replace
  title: 'Team Meeting',
  body:  'Starts in 1 hour',
  at:    new Date(meetingStartTime - 60 * 60 * 1000),
  data:  { scheduleId: 'meeting-123' },   // passed back when user taps
  sound: true,                            // default: true
  badge: 1,                              // iOS app icon badge count
})

// Cancel a scheduled (not yet fired) notification
await notifications.cancel('schedule-meeting-123')

// Cancel all pending notifications
await notifications.cancelAll()

// List all scheduled (not yet fired) notifications
const pending = await notifications.getPending()

// React to user tapping a notification — fires when app opens from notification
const unsub = notifications.onTap((event) => {
  // event.id   — the notification id
  // event.data — the data object you passed to schedule()
  navigateTo(`/schedule/${event.data.scheduleId}`)
})
```

```typescript
export interface NotificationOptions {
  id:      string            // stable identifier — scheduling again with same id replaces the existing one
  title:   string
  body:    string
  at:      Date | number     // exact fire time
  data?:   Record<string, unknown>
  sound?:  boolean           // default: true
  badge?:  number            // iOS only — app icon badge count
  channel?: string           // Android only — notification channel id (default: 'default')
}

export interface NotificationEvent {
  id:   string
  data: Record<string, unknown>
}

export declare const notifications: {
  requestPermission(): Promise<PermissionStatus>
  checkPermissions(): Promise<PermissionStatus>
  schedule(options: NotificationOptions): Promise<void>
  cancel(id: string): Promise<void>
  cancelAll(): Promise<void>
  getPending(): Promise<Array<{ id: string; scheduledAt: Date; title: string }>>
  onTap(handler: (event: NotificationEvent) => void): Unsubscribe
  /** Fires when a notification arrives while the app is in the foreground. */
  onForeground(handler: (event: NotificationEvent) => void): Unsubscribe
}
```

> **iOS limit**: max 64 pending local notifications per app. If you exceed this, oldest scheduled notifications are silently dropped. For apps with many future events, schedule only the nearest N.
>
> **Android 12+**: Exact alarms require `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` permission. Capsule declares `USE_EXACT_ALARM` in the shell manifest — no additional config needed.

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 2010 | `NOTIFICATION_PERMISSION_DENIED` | `schedule()` called without permission |
| 4020 | `NOTIFICATION_LIMIT_EXCEEDED` | iOS 64-notification limit reached |

---

### jobs (background)

Register periodic background tasks that run even when the app is closed. Wraps WorkManager (Android) and BGTaskScheduler (iOS).

> **Mobile constraint**: The OS controls when background jobs actually execute. "Every 4 hours" is a *minimum interval hint* — the OS may delay execution based on battery state, Doze mode (Android), or device usage patterns (iOS). Design your app to work correctly whether the job ran 4 hours ago or 12 hours ago.

#### Two tiers

**Tier 1 — Declarative** (no native code, covers 80% of use cases):

```typescript
// capsule.config.ts — registered at build time
import { defineConfig } from '@capsule/cli'

export default defineConfig({
  jobs: [
    {
      id:         'sync-schedules',
      interval:   '4h',             // minimum interval hint to the OS
      constraints: {
        network:  'required',       // only run when network is available
        battery:  'notLow',         // skip if battery is critically low
      },

      // Fetch from your API and merge into a local collection
      sync: {
        url:        'https://api.myapp.com/schedules',
        headers:    { Authorization: 'Bearer {{preferences.authToken}}' },
        collection: 'schedules',
        strategy:   'merge',        // 'merge' (upsert by id) | 'replace' (full replace)
      },

      // After sync: cancel old notifications and schedule new ones
      notify: {
        from:    'schedules',
        where:   { startsAt: { future: true } },
        limit:   60,                // respect iOS 64-notification cap
        notifications: [{
          trigger:     { minutesBefore: 60 },
          title:       '{{title}}',
          body:        'Starts in 1 hour',
          idTemplate:  'schedule-{{id}}-1h',
        }, {
          trigger:     { minutesBefore: 15 },
          title:       '{{title}}',
          body:        'Starting soon',
          idTemplate:  'schedule-{{id}}-15m',
        }]
      }
    }
  ]
})
```

**Tier 2 — Native handler** (for custom logic — use `capsule override job:<id>`):

```bash
capsule override job:sync-schedules
# scaffolds: capsule-overrides/jobs/SyncSchedulesJob.kt (Android)
#            capsule-overrides/jobs/SyncSchedulesJob.swift (iOS)
```

The scaffolded handler has full access to: HTTP client, SQLite (same db file), notification scheduling, and the Capsule bridge. The TypeScript API is unchanged from the app's perspective.

#### Runtime API (query job state from the web layer)

```typescript
import { jobs } from '@capsule/core'

// Get last run time and result of a registered job
const status = await jobs.status('sync-schedules')
// { lastRunAt: Date | null, lastResult: 'success' | 'failed' | 'skipped', nextRunAt: Date | null }

// Manually request an expedited run (best-effort — OS may still delay)
await jobs.requestRun('sync-schedules')

// Listen for job completion (fires when app is in foreground and job just finished)
const unsub = jobs.onComplete('sync-schedules', (result) => {
  console.log('Sync finished:', result.lastRunAt)
  // db.collection('schedules') is now up to date — refresh UI
})
```

```typescript
export declare const jobs: {
  status(id: string): Promise<JobStatus>
  requestRun(id: string): Promise<void>
  onComplete(id: string, handler: (status: JobStatus) => void): Unsubscribe
}

export interface JobStatus {
  id:          string
  lastRunAt:   Date | null
  lastResult:  'success' | 'failed' | 'skipped' | 'never'
  nextRunAt:   Date | null
}
```

> **Note**: Jobs are **registered at build time** via `capsule.config.ts` — you cannot register a new job dynamically at runtime. This is an OS requirement: both WorkManager and BGTaskScheduler require job identifiers to be declared at app install time.

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 4030 | `JOB_NOT_REGISTERED` | `jobs.status()` called with unknown job id |
| 4031 | `JOB_SYNC_FAILED` | Network error or non-2xx response during declarative sync |

---

### ui

Built today: native alert dialogs through `alerts.show()` ([alerts-styling.md](../guide/alerts-styling.md)). The `ui` module below is the wider design (toasts, banners, an in-app event channel).

In-app UI layer — two complementary APIs on the same capability:

- **Native overlays** (`ui.toast`, `ui.banner`, `ui.alert`) — render on top of the WebView. Zero web code needed. Work regardless of what component is mounted.
- **In-app event channel** (`ui.notify` / `ui.onNotify`) — fire events from anywhere (web layer, native job handler, background task) and handle them in any web component with full UI control.

They compose: a native job fires `ui.notify()`, a React/Vue component subscribes and renders a rich modal. Or skips the component entirely and calls `ui.toast()`. Developer picks what fits.

> **Scope**: `ui.*` only works when the app is **open or coming to foreground**. For OS-level notifications that appear when the app is closed, use `notifications.schedule()`.

---

#### Native overlays

##### `ui.toast()` — simple feedback

Renders a native toast on top of the WebView. No component needed, no framework dependency. Appears over any screen including loading states.

```typescript
import { ui } from '@capsule/core'

// Simple
await ui.toast({ message: 'Schedules synced' })

// With duration and action
await ui.toast({
  message:  '42 schedules updated',
  duration: 4000,
  action: {
    label:   'View',
    onPress: () => navigate('/schedules')
  }
})
```

##### `ui.banner()` — heads-up notification

Top-of-screen slide-in banner. Richer than a toast — has title, body, optional icon, optional action. Ideal for showing an in-app equivalent of a system notification while the user is already in the app.

```typescript
await ui.banner({
  title:    'Team Meeting',
  body:     'Starts in 1 hour',
  icon:     '/assets/calendar.png',  // optional
  duration: 5000,
  action: {
    label: 'View schedule',
    data:  { scheduleId: 'meeting-123' }
  },
  onTap: (action) => navigate(`/schedule/${action.data.scheduleId}`)
})
```

##### `ui.alert()` — native OS dialog

Displays a native platform alert dialog (not a web modal). Blocks until the user responds. Use for confirmations and destructive actions where a native dialog carries more trust weight.

```typescript
const result = await ui.alert({
  title:   'Delete schedule?',
  message: 'This cannot be undone.',
  buttons: [
    { label: 'Cancel',  style: 'cancel' },
    { label: 'Delete',  style: 'destructive' }
  ]
})

if (result.label === 'Delete') {
  await schedules.remove(id)
}
```

---

#### In-app event channel

`ui.notify()` / `ui.onNotify()` — a typed event bus that crosses the native/web boundary. Fire from anywhere: web layer, native job handler, `notifications.onForeground()`, `jobs.onComplete()`. Subscribe in any web component.

```typescript
// ── Firing an event (from anywhere) ──────────────────────────────────

// From the web layer
ui.notify({ type: 'schedule-reminder', data: { scheduleId: '123', title: 'Team Meeting' } })

// From notifications (when notification arrives while app is open)
notifications.onForeground((event) => {
  ui.notify({ type: 'schedule-reminder', data: event.data })
})

// From a completed background job
jobs.onComplete('sync-schedules', (status) => {
  ui.notify({ type: 'sync-complete', data: { syncedAt: status.lastRunAt } })
})

// From a native job handler (Kotlin/Swift) — same bridge mechanism
// bridge.sendNotification("ui.notify", { type: "sync-complete", data: {...} })

// ── Subscribing in a component ────────────────────────────────────────

// Typed subscription — only receives 'schedule-reminder' events
const unsub = ui.onNotify('schedule-reminder', (data) => {
  // data is typed based on what you passed to ui.notify()
  openModal({ scheduleId: data.scheduleId, title: data.title })
})

// Catch-all subscription — receives all events
const unsub = ui.onNotify((event) => {
  console.log(event.type, event.data)
})

// Unsubscribe when component unmounts
onUnmount(() => unsub())
```

---

#### Combining both — the full pattern

```typescript
// ScheduleService.ts — registered once at app startup
import { notifications, jobs, ui } from '@capsule/core'

// Bridge OS notifications → in-app event channel
notifications.onForeground((event) => {
  ui.notify({ type: event.data.type ?? 'notification', data: event.data })
})

// Bridge job completion → in-app event channel
jobs.onComplete('sync-schedules', (status) => {
  ui.notify({ type: 'sync-complete', data: { at: status.lastRunAt } })
})
```

```tsx
// ScheduleReminder.tsx — React component, handles rich UI
import { ui } from '@capsule/core'
import { useEffect } from 'react'

export function ScheduleReminder() {
  const [reminder, setReminder] = useState(null)

  useEffect(() => {
    // Rich UI path — component renders its own modal
    const unsub = ui.onNotify('schedule-reminder', (data) => {
      setReminder(data)
    })
    return unsub
  }, [])

  return reminder ? <ReminderModal data={reminder} onClose={() => setReminder(null)} /> : null
}
```

```typescript
// BackgroundSyncIndicator.ts — simpler case, just needs a toast
import { ui } from '@capsule/core'

ui.onNotify('sync-complete', ({ at }) => {
  ui.toast({ message: `Synced ${at.toLocaleTimeString()}`, duration: 2000 })
})
```

---

#### Interface

```typescript
export interface ToastOptions {
  message:   string
  duration?: number                          // ms, default: 3000
  action?:   { label: string; onPress: () => void }
}

export interface BannerOptions {
  title:     string
  body?:     string
  icon?:     string                          // asset URL or base64
  duration?: number                          // ms, default: 5000
  action?:   { label: string; data?: unknown }
  onTap?:    (action: { data?: unknown }) => void
  onDismiss?: () => void
}

export interface AlertOptions {
  title:    string
  message:  string
  buttons?: Array<{ label: string; style?: 'default' | 'cancel' | 'destructive' }>
}

export interface AlertResult {
  index: number
  label: string
}

export interface InAppEvent<T = unknown> {
  type: string
  data?: T
}

export declare const ui: {
  // Native overlays
  toast(options: ToastOptions): Promise<void>
  banner(options: BannerOptions): Promise<void>
  alert(options: AlertOptions): Promise<AlertResult>

  // In-app event channel
  notify<T = unknown>(event: InAppEvent<T>): void
  onNotify<T = unknown>(type: string, handler: (data: T) => void): Unsubscribe
  onNotify(handler: (event: InAppEvent) => void): Unsubscribe  // catch-all
}
```

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 4040 | `UI_ALERT_DISMISSED` | Alert dismissed by OS (e.g. incoming call) without user tapping a button |

---

### browser

Opens a URL in a native in-app browser overlay — `Chrome Custom Tabs` (Android) or `SFSafariViewController` (iOS). The user sees a real browser with an address bar, which is the correct trust signal for OAuth flows and payment pages.

```typescript
export interface BrowserOpenOptions {
  url: string
  /** Toolbar tint color. Hex '#RRGGBB'. Applied on a best-effort basis per platform. */
  toolbarColor?: string
  /** Presentation style. Default: 'fullscreen' */
  presentationStyle?: 'fullscreen' | 'popover'
  /** Show share button in the toolbar. Default: true */
  enableShare?: boolean
}

export declare const browser: {
  /** Open a URL in the system in-app browser. */
  open(options: BrowserOpenOptions): Promise<void>
  /** Programmatically dismiss the browser (e.g. after detecting an OAuth callback URL). */
  close(): Promise<void>
  /** Fires when the browser is dismissed by the user or by close(). */
  onFinished(handler: () => void): Unsubscribe
  /**
   * Fires on every URL change inside the browser.
   * Primary use case: detect OAuth redirect URIs.
   */
  onNavigationChange(handler: (event: { url: string }) => void): Unsubscribe
  /**
   * Pre-warm a Chrome Custom Tab for faster subsequent open(). Android only, no-op on iOS.
   * Call early (e.g. when the login screen mounts) with the auth URL's origin.
   */
  prefetch(url: string): Promise<void>
}
```

**Typical OAuth / payment flow:**

```typescript
import { browser } from '@capsule/core'

const unsub = browser.onNavigationChange(({ url }) => {
  if (url.startsWith('myapp://oauth/callback')) {
    browser.close()
    unsub()
    handleOAuthCallback(url)
  }
})

await browser.open({ url: authorizationUrl })
```

> No permissions required. iOS restricts `SFSafariViewController` to `https://` URLs.

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 3020 | `BROWSER_UNAVAILABLE` | No browser available on device (rare) |
| 4022 | `INVALID_URL` | URL is not a valid `https://` URL (iOS restriction) |
| 5020 | `BROWSER_CANCELLED` | User dismissed before `onFinished` was set (edge case) |

---

### inlineWebView

Renders a second native `WebView` as an overlay, positioned absolutely within the app. Use for embedded content that must live *inside* your app's layout — help center chat, embedded payment widgets, interactive third-party content.

```typescript
export interface InlineWebViewOptions {
  /** URL to load. Mutually exclusive with `html`. */
  url?: string
  /** HTML string to render directly. Mutually exclusive with `url`. */
  html?: string
  /**
   * Position and size. Numbers are interpreted as dp (Android) / pts (iOS).
   * Strings ending in '%' are relative to the screen dimension.
   */
  rect: {
    top:    number | string
    left:   number | string
    width:  number | string
    height: number | string
  }
  /** Allow the embedded page to call through to the Capsule bridge. Default: false */
  allowBridgeAccess?: boolean
  /**
   * Prevent navigation away from the initial origin. Default: true.
   * Set false when you need multi-origin flows (e.g. payment redirects).
   */
  lockToOrigin?: boolean
  /** Background color shown before the page loads. Hex '#RRGGBB'. Default: '#FFFFFF' */
  backgroundColor?: string
}

export interface InlineWebViewHandle {
  /** Navigate to a new URL. */
  loadUrl(url: string): Promise<void>
  /** Replace content with an HTML string. */
  loadHtml(html: string): Promise<void>
  /** Reposition or resize without destroying the view. */
  setRect(rect: InlineWebViewOptions['rect']): Promise<void>
  show(): Promise<void>
  hide(): Promise<void>
  /**
   * Evaluate JavaScript inside the embedded page.
   * Returns the serialised result (JSON.stringify of the expression value).
   */
  evaluateJS(script: string): Promise<string>
  /** Fires on every URL change inside the embedded view. */
  onNavigationChange(handler: (event: { url: string; canGoBack: boolean }) => void): Unsubscribe
  /** Fires when a page finishes loading. */
  onLoad(handler: (event: { url: string }) => void): Unsubscribe
  /** Fires on any page-load error. */
  onError(handler: (event: { url: string; code: number; message: string }) => void): Unsubscribe
  /** Remove the overlay and free native resources. */
  destroy(): Promise<void>
}

export declare const inlineWebView: {
  /** Create and immediately display an inline WebView overlay. */
  create(options: InlineWebViewOptions): Promise<InlineWebViewHandle>
}
```

**Usage example:**

```typescript
import { inlineWebView } from '@capsule/core'

const view = await inlineWebView.create({
  url: 'https://help.myapp.com',
  rect: { top: '10%', left: 0, width: '100%', height: '90%' }
})

// Close button in your own UI calls:
await view.destroy()
```

**When to use `browser` vs `inlineWebView`:**

| Scenario | Use |
|----------|-----|
| OAuth / external auth | `browser` — address bar builds trust |
| Payment page redirect flow | `browser` |
| External link from inside app | `browser` |
| Embedded help center / chat widget | `inlineWebView` |
| Embedded payment widget (no redirect) | `inlineWebView` |
| Rendering controlled HTML inside app | `inlineWebView` with `html:` option |

**Error codes**

| Code | Constant | When |
|------|----------|------|
| 4021 | `INVALID_WEBVIEW_OPTIONS` | Neither `url` nor `html` provided, or both provided |
| 3021 | `WEBVIEW_LOAD_FAILED` | Page load failed (see `onError` for details) |
