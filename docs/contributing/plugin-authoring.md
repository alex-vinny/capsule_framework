---
title: "Plugin authoring"
audience: contributor
status: draft
---
# Capsule Framework — Community Integration Authoring Guide

> For authors building third-party SDK wrappers or custom integrations. Core platform capabilities (camera, GPS, push, NFC, Bluetooth, haptics, biometrics, filesystem, etc.) are already part of `@capsule/core` — you do not need to build plugins for OS APIs that ship with the platform.
>
> Use this guide when wrapping: Google Maps, Stripe, Braintree, Firebase, Facebook Auth, or any SDK that requires a third-party dependency. For bridge internals and language feasibility see `plugins.md`.

---

## Quick Start — Your First Integration in 5 Minutes

```bash
# Scaffold a new community integration
capsule plugin create google-maps

# Result:
# capsule-plugins/
#   google-maps/
#     capsule-plugin.json
#     android/GoogleMapsIntegration.kt
#     ios/GoogleMapsIntegration.swift
#     web/index.ts
```

Declare it in `capsule.config.ts`:
```typescript
plugins: ['./capsule-plugins/google-maps']
```

Run `capsule build android` — your integration compiles alongside the app. Done.

---

## File Structure

```
capsule-plugins/
  barcode/
    capsule-plugin.json      ← required: metadata, permissions, dependencies, platform declarations
    proguard.rules           ← optional: R8 keep rules (merged by CLI into proguard-rules.pro)
    android/
      BarcodeScanner.kt      ← Kotlin implementation (or .java)
    ios/
      BarcodeScanner.swift   ← Swift implementation
    web/
      index.ts               ← TypeScript bridge (web-facing API)
      index.d.ts             ← auto-generated types (from `capsule generate types`)
```

All files are optional per platform. A web-only plugin needs only `web/index.ts`. An Android-only plugin needs only `android/` + `web/index.ts`.

---

## Plugin minSdk Conflict Behavior

When a source plugin's `capsule-plugin.json` declares a higher `minSdk` than the app's `capsule.config.ts`:

```
App:    android.minSdk: 26
Plugin: android.minSdk: 30
```

**CLI behavior at `capsule sync` / `capsule build`**:

```
⚠ Warning: Plugin "barcode" requires minSdk 30 (Android 11).
  The app targets minSdk 26 (Android 8.0).
  Devices on Android 8.0–10.x will not load this plugin.
  Plugin methods will return error 3001 (PLUGIN_UNAVAILABLE) on unsupported devices.

  Options:
  → Raise app minSdk to 30:  set android.minSdk: 30 in capsule.config.ts
  → Accept the limitation:   the plugin loads silently only on Android 11+
```

The plugin is **not removed** and the build does not fail — it compiles and ships with the app. On devices below the plugin's `minSdk`, the Capsule bridge returns a typed error:

```typescript
// Web layer should handle this
try {
  const result = await barcode.scan()
} catch (e) {
  if (e.code === 3001) {
    // Plugin unavailable on this device/OS version
    showFallbackUI()
  }
}
```

**When a plugin genuinely cannot support older Android** (the warning is accurate):
- Uses `CameraX` 1.3+ (requires API 28)
- Uses `BiometricPrompt` (API 28)
- Uses Foreground Service types (API 29)
- Uses exact `AlarmManager` scheduling (API 31)
- Uses Bluetooth LE with new permission model (API 31)
- Uses `UsbManager` new APIs (API 31)

In these cases, raise the app's `minSdk` or document the device requirement clearly.

---

## `capsule-plugin.json` — Plugin Manifest

```json
{
  "name": "barcode",
  "version": "1.0.0",
  "description": "Barcode and QR code scanner",
  "platforms": ["android", "ios"],
  "sourceRepo": "https://github.com/you/capsule-plugin-barcode",

  "android": {
    "permissions": ["CAMERA"],
    "minSdk": 26,
    "dependencies": [
      "com.google.zxing:core:3.5.0",
      "androidx.camera:camera-core:1.3.0"
    ]
  },

  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "Used to scan barcodes"
    },
    "capabilities": [],
    "podDependencies": []
  }
}
```

### All manifest fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Plugin identifier — used as the bridge prefix (`barcode.scan`) |
| `version` | Yes | Semver |
| `platforms` | Yes | `["android"]`, `["ios"]`, or `["android", "ios"]` |
| `android.permissions` | No | Android manifest permissions (no `android.permission.` prefix) |
| `android.minSdk` | No | Override app minSdk for this plugin |
| `android.dependencies` | No | Maven coordinates — CLI merges into generated `build.gradle` (see below) |
| `ios.infoPlist` | No | Keys injected into `Info.plist` |
| `ios.capabilities` | No | Xcode capabilities (`push-notifications`, `nfc`, etc.) |
| `ios.podDependencies` | No | CocoaPods dependencies — `[{ "name": "ZXingObjC", "version": "~> 3.6" }]` |
| `sourceRepo` | **Required for `@capsule-community/*`** | Git URL — enables `capsule eject`. Without this field, `capsule plugin publish` rejects publishing under the community scope. |

---

## Gradle / CocoaPods Dependencies

Declare third-party dependencies your plugin needs. The CLI collects these at `capsule sync` time, resolves conflicts across all installed plugins, and injects into the generated build files — no Gradle knowledge required.

```json
"android": {
  "dependencies": [
    "com.google.zxing:core:3.5.0",
    "androidx.camera:camera-core:1.3.0",
    "androidx.camera:camera-lifecycle:1.3.0"
  ]
}
```

**Conflict resolution:** If two plugins require the same `groupId:artifactId` at different versions, the CLI applies "highest compatible version wins" (mirrors Gradle default) and prints a summary at `capsule sync`. Hard errors only when versions are in different majors — CLI names exactly which plugins conflict. Developers can use `android.gradleOverrides` as a last resort.

**ProGuard / R8:** If your plugin uses reflection, ship a `proguard.rules` file at the plugin root:
```
# proguard.rules
-keep class com.example.myplugin.** { *; }
```
The CLI merges this into the generated `proguard-rules.pro`. Without a `proguard.rules` file, the CLI adds a conservative blanket `-keep` for your plugin's package — safe but less optimized. R8 is enabled by default on release builds.

---

## Android — `CapsulePlugin` Base Class API

Every Android plugin extends `CapsulePlugin`:

```kotlin
import dev.capsule.bridge.CapsulePlugin
import dev.capsule.bridge.CapsuleBridge
import dev.capsule.bridge.BridgeCall
import dev.capsule.bridge.BridgeMethod

@CapsulePlugin(name = "barcode")
class BarcodeScanner(bridge: CapsuleBridge) : CapsulePlugin(bridge) {

    // ─── Called once when the app starts ──────────────────────────────────────
    override fun load() {
        // initialize resources, open connections
    }

    // ─── Called when app goes to background ───────────────────────────────────
    override fun pause() { /* release camera */ }

    // ─── Called when app returns to foreground ────────────────────────────────
    override fun resume() { /* reacquire */ }

    // ─── Called when app is destroyed ─────────────────────────────────────────
    override fun destroy() { /* close DB, free memory */ }

    // ─── Plugin methods — exposed to JS via @BridgeMethod ─────────────────────
    @BridgeMethod
    fun scan(call: BridgeCall) {
        val quality = call.getFloat("quality", 0.8f)
        val facing  = call.getString("facing", "back")

        onMain {
            // UI work must run on main thread
            startCameraIntent { result ->
                call.resolve(mapOf(
                    "value"  to result.rawValue,
                    "format" to result.format
                ))
            }
        }
    }

    @BridgeMethod
    fun getFlash(call: BridgeCall) {
        call.resolve(mapOf("enabled" to isFlashOn()))
    }

    @BridgeMethod
    fun setFlash(call: BridgeCall) {
        val enable = call.getBoolean("enable", false)
        setFlashEnabled(enable)
        call.resolve()           // resolve with no data
    }
}
```

### `CapsulePlugin` helpers (inherited)

```kotlin
// Thread dispatchers
onMain { /* run on UI thread */ }
onIO   { /* run on IO thread (suspend) */ }

// Access to Android context
bridge.context        // Application context
bridge.activity       // Current Activity
bridge.webView        // The WebView instance

// Emit an event to the web layer (no active JS call needed)
emit("barcode.onScanResult", mapOf("value" to "123", "format" to "QR"))
```

---

## Android — `BridgeCall` API

The `call` object is your window into the JS request and your way to respond.

### Reading parameters

```kotlin
// Strings
call.getString("key")                  // String? — null if missing
call.getString("key", "default")       // String  — with default

// Numbers
call.getInt("key", 0)                  // Int
call.getLong("key", 0L)                // Long
call.getFloat("key", 0f)              // Float
call.getDouble("key", 0.0)            // Double

// Boolean
call.getBoolean("key", false)          // Boolean

// Nested object (as Map)
call.getObject("options")              // Map<String, Any>?

// Array
call.getArray("items")                 // List<Any>?

// Check presence
call.has("key")                        // Boolean

// Raw JSON string of all params
call.paramsJson                        // String
```

### Sending responses

```kotlin
// Resolve with data
call.resolve(mapOf("value" to "hello", "count" to 42))

// Resolve with no data (void method)
call.resolve()

// Reject with an error code and message
call.reject(2001, "Camera permission denied")

// Capsule standard error codes (matches known-issues.md bridge spec):
// 1xxx — framework/bridge errors (reserved for framework)
// 2xxx — permission errors
// 3xxx — hardware/resource errors (camera unavailable, not found)
// 4xxx — plugin-specific logic errors
// 5xxx — user cancellation
```

---

## iOS — `CapsulePlugin` Base Class API

```swift
import CapsuleBridge

@CapsulePlugin("barcode")
class BarcodeScanner: CapsulePlugin {

    // ─── Called once when the app starts ──────────────────────────────────────
    override func load() { }

    override func pause()   { }
    override func resume()  { }
    override func destroy() { }

    // ─── Plugin methods ────────────────────────────────────────────────────────
    @BridgeMethod
    func scan(_ call: BridgeCall) {
        let quality = call.getFloat("quality") ?? 0.8
        let facing  = call.getString("facing") ?? "back"

        // WKScriptMessageHandler delivers on main thread — safe to do UI work directly
        startCamera(quality: quality, facing: facing) { result in
            call.resolve([
                "value":  result.rawValue,
                "format": result.format
            ])
        }
    }

    @BridgeMethod
    func getFlash(_ call: BridgeCall) {
        call.resolve(["enabled": isFlashOn()])
    }

    @BridgeMethod
    func setFlash(_ call: BridgeCall) {
        let enable = call.getBool("enable") ?? false
        setFlashEnabled(enable)
        call.resolve()
    }
}
```

### `CapsulePlugin` helpers (inherited)

```swift
// Access
bridge.viewController     // UIViewController
bridge.webView            // WKWebView

// Emit an event to the web layer
emit("barcode.onScanResult", ["value": "123", "format": "QR"])

// Dispatch to a background queue for heavy work
DispatchQueue.global(qos: .userInitiated).async {
    let result = self.heavyComputation()
    call.resolve(["result": result])   // resolve is thread-safe
}
```

### iOS — `BridgeCall` API

```swift
// Strings
call.getString("key")                  // String?
call.getString("key", default: "val")  // String

// Numbers
call.getInt("key")                     // Int?
call.getFloat("key")                   // Float?
call.getDouble("key")                  // Double?

// Boolean
call.getBool("key")                    // Bool?

// Nested
call.getObject("options")             // [String: Any]?
call.getArray("items")                // [Any]?

// Presence
call.has("key")                       // Bool

// Respond
call.resolve(["key": value])          // with data
call.resolve()                        // no data
call.reject(2001, "Permission denied")
```

---

## TypeScript — Web Bridge (`web/index.ts`)

The web layer is what app developers import. Write it against `@capsule/core`.

```typescript
// capsule-plugins/barcode/web/index.ts
import { bridge } from '@capsule/core'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanResult {
  value: string
  format: 'QR' | 'EAN13' | 'CODE128' | 'DATAMATRIX' | string
}

export interface ScanOptions {
  quality?: number          // 0.0–1.0, default 0.8
  facing?: 'front' | 'back' // default 'back'
}

// ─── Plugin API ───────────────────────────────────────────────────────────────

export const barcode = {
  /**
   * Open the camera and scan a barcode or QR code.
   * Resolves when a code is detected or the user cancels.
   */
  scan(options?: ScanOptions): Promise<ScanResult> {
    return bridge.call('barcode.scan', options ?? {})
  },

  /**
   * Get current flash state.
   */
  getFlash(): Promise<{ enabled: boolean }> {
    return bridge.call('barcode.getFlash', {})
  },

  /**
   * Enable or disable the camera flash.
   */
  setFlash(enable: boolean): Promise<void> {
    return bridge.call('barcode.setFlash', { enable })
  },

  /**
   * Subscribe to continuous scan results.
   * Returns an unsubscribe function.
   */
  onScanResult(handler: (data: ScanResult) => void): () => void {
    return bridge.on('barcode.onScanResult', handler)
  }
}
```

### `@capsule/core` API

```typescript
import { bridge } from '@capsule/core'

// Single call → Promise
bridge.call<T>(method: string, params: object): Promise<T>

// Subscribe to native events
bridge.on(event: string, handler: (data: unknown) => void): () => void
// Returns unsubscribe function — call it to stop listening

// Unsubscribe manually (alternative to returned function)
bridge.off(event: string, handler: Function): void
```

---

## App Developer Usage (end result)

After the plugin is built, the app developer uses:

```typescript
// Any component — React, Vue, Svelte, or Vanilla
import { barcode } from './capsule-plugins/barcode/web'
// or, if published to npm:
import { barcode } from '@capsule/barcode'

// Single scan
const result = await barcode.scan({ facing: 'back' })
console.log(result.value, result.format)

// Event listener (for continuous mode)
const unsubscribe = barcode.onScanResult((data) => {
  console.log('Scanned:', data.value)
})

// Later: cleanup
unsubscribe()
```

---

## Auto-generating TypeScript Types

Instead of writing `web/index.ts` by hand, annotate the Kotlin class and generate:

```kotlin
@CapsulePlugin(name = "barcode")
class BarcodeScanner(bridge: CapsuleBridge) : CapsulePlugin(bridge) {

    @BridgeMethod
    @Returns(ScanResult::class)
    fun scan(
        @BridgeParam("quality", optional = true, default = "0.8") quality: Float,
        @BridgeParam("facing",  optional = true, default = "back") facing: String
    ): Unit

    @BridgeEvent
    @Emits(ScanResult::class)
    fun onScanResult(): Unit
}

@BridgeType
data class ScanResult(
    val value: String,
    val format: String
)
```

```bash
capsule generate types --plugin barcode
# writes capsule-plugins/barcode/web/index.d.ts and index.ts
```

---

## Platform-Conditional Code in the Web Bridge

Some plugins work on one platform only. The web layer handles this gracefully:

```typescript
import { bridge, getPlatform } from '@capsule/core'

export const haptics = {
  impact(style: 'light' | 'medium' | 'heavy'): Promise<void> {
    // Web platform has no haptics — silently no-op
    if (getPlatform() === 'web') return Promise.resolve()
    return bridge.call('haptics.impact', { style })
  }
}
```

`getPlatform()` returns `'android' | 'ios' | 'web'`.

---

## Plugin Development Loop & Hot Reload

### Web layer changes (TypeScript / `web/index.ts`)
Vite HMR applies instantly — no rebuild needed. Changes to the TypeScript bridge are live in under 50ms.

### Native layer changes (`.kt` / `.swift` / `.c`)
Native code requires a full recompile. `capsule dev` watches for `.kt` and `.swift` file changes and prints a reminder:

```
⚠ Native source changed: capsule-plugins/barcode/android/BarcodeScanner.kt
  Hot reload does not apply to native code changes.
  Run: capsule build android  (then re-deploy to emulator)
```

The Vite dev server keeps running — only the native layer needs rebuilding. Typical incremental Kotlin rebuild via Gradle build cache: 5–15 seconds (not a full rebuild).

**Practical workflow**:
1. Edit `.kt` file
2. See the warning in the `capsule dev` terminal
3. In a second terminal: `capsule build android && capsule run android`
4. Continue editing web code — Vite HMR resumes immediately

---

## Plugin Testing

### Test a method directly on a running emulator

```bash
# Call a plugin method from the CLI without writing any JS
capsule plugin call barcode scan '{"quality": 0.9, "facing": "back"}'

# Output:
# → {"value": "https://example.com", "format": "QR"}
```

### Type-check the web bridge against native annotations

```bash
capsule plugin check barcode
# Validates that every @BridgeMethod has a matching export in web/index.ts
# Validates that all parameter types match
```

---

## Publishing a Plugin to npm (Mode 1 Binary)

When your source plugin is ready to share:

```bash
# Package + publish
capsule plugin publish ./capsule-plugins/barcode

# What this does:
# 1. Runs capsule build android + ios to produce AAR and XCFramework
# 2. Packages AAR, XCFramework, and web/index.ts into an npm tarball
# 3. Publishes to npm as the configured package name
# 4. Optionally publishes AAR to GitHub Packages (Maven) and XCFramework via SPM
```

After publishing, other developers install it with:
```bash
npm install @yourscope/barcode
# Then add '@yourscope/barcode' to capsule.config.ts plugins array
```

To let them fork the plugin source:
```json
// capsule-plugin.json
{
  "sourceRepo": "https://github.com/you/capsule-plugin-barcode"
}
```

They can then `capsule eject @yourscope/barcode` to get full source access.

---

## Complete Worked Example — `@capsule/storage`

A localStorage-on-steroids plugin: web-compatible API, native backend (SQLite on device, localStorage on browser).

### `capsule-plugin.json`
```json
{
  "name": "storage",
  "version": "1.0.0",
  "platforms": ["android", "ios"],
  "android": { "permissions": [] },
  "ios": {}
}
```

### `android/Storage.kt`
```kotlin
@CapsulePlugin(name = "storage")
class Storage(bridge: CapsuleBridge) : CapsulePlugin(bridge) {

    private lateinit var db: StorageDatabase   // Room or SQLite

    override fun load() {
        db = StorageDatabase.open(bridge.context)
    }

    @BridgeMethod
    fun get(call: BridgeCall) {
        val key = call.getString("key") ?: return call.reject(4001, "key is required")
        onIO {
            val value = db.get(key)
            call.resolve(mapOf("value" to value))
        }
    }

    @BridgeMethod
    fun set(call: BridgeCall) {
        val key   = call.getString("key")   ?: return call.reject(4001, "key is required")
        val value = call.getString("value") ?: return call.reject(4001, "value is required")
        onIO {
            db.set(key, value)
            call.resolve()
        }
    }

    @BridgeMethod
    fun remove(call: BridgeCall) {
        val key = call.getString("key") ?: return call.reject(4001, "key is required")
        onIO {
            db.remove(key)
            call.resolve()
        }
    }

    @BridgeMethod
    fun clear(call: BridgeCall) {
        onIO {
            db.clear()
            call.resolve()
        }
    }

    override fun destroy() {
        db.close()
    }
}
```

### `ios/Storage.swift`
```swift
@CapsulePlugin("storage")
class Storage: CapsulePlugin {

    private var db: StorageDatabase!

    override func load() {
        db = StorageDatabase()
    }

    @BridgeMethod
    func get(_ call: BridgeCall) {
        guard let key = call.getString("key") else {
            return call.reject(4001, "key is required")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let value = self.db.get(key)
            call.resolve(["value": value as Any])
        }
    }

    @BridgeMethod
    func set(_ call: BridgeCall) {
        guard let key   = call.getString("key"),
              let value = call.getString("value") else {
            return call.reject(4001, "key and value are required")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            self.db.set(key, value: value)
            call.resolve()
        }
    }

    @BridgeMethod
    func remove(_ call: BridgeCall) {
        guard let key = call.getString("key") else {
            return call.reject(4001, "key is required")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            self.db.remove(key)
            call.resolve()
        }
    }

    @BridgeMethod
    func clear(_ call: BridgeCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            self.db.clear()
            call.resolve()
        }
    }
}
```

### `web/index.ts`
```typescript
import { bridge, getPlatform } from '@capsule/core'

export const storage = {
  async get(key: string): Promise<string | null> {
    if (getPlatform() === 'web') return localStorage.getItem(key)
    const { value } = await bridge.call<{ value: string | null }>('storage.get', { key })
    return value
  },

  async set(key: string, value: string): Promise<void> {
    if (getPlatform() === 'web') { localStorage.setItem(key, value); return }
    await bridge.call('storage.set', { key, value })
  },

  async remove(key: string): Promise<void> {
    if (getPlatform() === 'web') { localStorage.removeItem(key); return }
    await bridge.call('storage.remove', { key })
  },

  async clear(): Promise<void> {
    if (getPlatform() === 'web') { localStorage.clear(); return }
    await bridge.call('storage.clear', {})
  }
}
```

---

## Quick Reference Card

```
capsule plugin create <name>           scaffold new source plugin
capsule plugin call <name> <method>    test a method on the emulator
capsule plugin check <name>            validate TS bridge vs native annotations
capsule generate types --plugin <name> generate TS from Kotlin/Swift annotations
capsule plugin publish ./path          build + publish to npm
capsule eject @scope/plugin            fork npm plugin to local source
capsule override <capability>          patch a built-in core capability (camera, gps, push, etc.)
```

```
@CapsulePlugin(name = "foo")           mark class as a plugin
@BridgeMethod                          expose a method to JS
@BridgeParam("key")                    annotate a parameter (for type gen)
@BridgeEvent / @Emits(T::class)        mark an event emitter (for type gen)
@BridgeType                            mark a data class for TS generation
```
