---
title: "Plugin system"
audience: contributor
status: planned
---
# Capsule Framework — Community Integration System (Deep Technical Reference)

> How community integrations (third-party SDK wrappers) work at every layer: bridge wire protocol, native dispatch, code generation, threading, language feasibility, and what already exists to reuse.

---

## Scope: Community Integrations vs. Core SDK

**Core platform capabilities** (camera, GPS, push, NFC, Bluetooth, haptics, biometrics, filesystem, barcode, etc.) are built into `@capsule/core`. They are not plugins — they ship with the framework and are tree-shaken if unused. Developers import them directly, no installation required.

**Community integrations** are what this document covers: third-party SDK wrappers (`@capsule-community/google-maps`, `@capsule-community/stripe`, etc.) and custom local integrations that require SDKs the Capsule team does not own or control.

The same bridge protocol, dispatch system, and language support documented here applies to both layers. The distinction is ownership and distribution, not technical architecture.

---

## Two Integration Modes

```
Mode 1 — Binary (npm)                    Mode 2 — Source (inline)
──────────────────────────────────────   ──────────────────────────────────────
npm install @capsule-community/maps      capsule-plugins/
                                           my-integration/
Pre-compiled AAR + XCFramework             android/MyIntegration.kt
Distributed via npm + Maven/SPM            ios/MyIntegration.swift
No modification                            web/index.ts
                                           image-processor/
                                             android/proc.c    ← NDK
                                             game-logic.lua    ← scripting VM
```

Both modes register through the same JSON-RPC 2.0 bridge. From the web layer they are identical.

---

## Part 1 — The Bridge: How JS Calls Reach Native Code

This is the core mechanism everything else builds on. Understanding it precisely is required before designing plugins.

### Android: `addJavascriptInterface` vs `addWebMessageListener`

**Option A — `addJavascriptInterface` (API 1+, minSdk 26 safe)**

```kotlin
// CapsuleBridge.kt
// Name "__capsule_host" to avoid colliding with the JS-side runtime object "__capsule"
webView.addJavascriptInterface(BridgeHost(this), "__capsule_host")
```

```java
class BridgeHost(private val bridge: CapsuleBridge) {
    @JavascriptInterface                // required annotation — exposes method to JS
    fun postMessage(json: String) {
        bridge.handleCall(json)         // runs on a WebView background thread, NOT main thread
    }
}
```

JavaScript side:
```javascript
// window.__capsule_host is the native Java object (Android only)
// window.__capsule is the JS runtime object (defined by @capsule/core)
window.__capsule_host.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    id: 'uuid-abc',
    method: 'barcode.scan',
    params: { quality: 0.8 }
}))
```

> **Naming convention**: `__capsule_host` is the raw native interface exposed by `addJavascriptInterface`. `__capsule` is the high-level JS runtime object defined by `@capsule/core` that manages Promises and events. They are distinct objects. Using the same name for both would cause `addJavascriptInterface` to overwrite the JS runtime object during WebView initialization.

**Critical threading fact**: `@JavascriptInterface` methods execute on an **arbitrary WebView background thread**, never the main thread. Plugins must dispatch to the right thread explicitly if they need UI access (`bridge.activity.runOnUiThread { ... }`).

**Option B — `addWebMessageListener` (API 24+, Chromium WebView only)**

```kotlin
webView.addWebMessageListener(
    "__capsule_msg",
    setOf("https://localhost"),   // allowed origins
    object : WebViewCompat.WebMessageListener {
        override fun onPostMessage(view: WebView, message: WebMessageCompat, ...) {
            bridge.handleCall(message.data!!)
        }
    }
)
```

JavaScript side:
```javascript
window.__capsule_msg.postMessage(JSON.stringify({ ... }))
```

**Comparison**:

| | `addJavascriptInterface` | `addWebMessageListener` |
|-|--------------------------|------------------------|
| API level | 1+ | 24+ (Android 7) |
| WebView type | Any | Chromium WebView only |
| Origin restriction | No (security risk in mixed content) | Yes (set of allowed origins) |
| Object exposure | Full JS object with methods | Single `postMessage` only |
| Used by Capacitor | Yes (primary) | No |
| Recommendation | Use — minSdk 26 removes legacy risks | Future-proof but not necessary now |

**Decision for Capsule**: Use `addJavascriptInterface`. It is what Capacitor, Cordova, and every production WebView bridge uses. minSdk 26 eliminates the pre-4.2 vulnerability. `addWebMessageListener` offers no meaningful advantage for this use case.

---

### Android: Native → JS (calling back into the WebView)

```kotlin
// Runs on main thread (evaluateJavascript REQUIRES main thread)
// Calls into the JS-side runtime object __capsule (managed by @capsule/core)
activity.runOnUiThread {
    webView.evaluateJavascript(
        "window.__capsule._resolve('${callId}', ${resultJson})",
        null
    )
}
```

This is how `call.resolve(data)` works internally. Every plugin response follows this path.
`window.__capsule` here is the **JS-side runtime** (defined by `@capsule/core`), NOT the native host object `__capsule_host`.

**For events** (native pushes to web unprompted):
```kotlin
activity.runOnUiThread {
    webView.evaluateJavascript(
        "window.__capsule._event('push.messageReceived', ${dataJson})",
        null
    )
}
```

---

### iOS: `WKScriptMessageHandler` vs `WKScriptMessageHandlerWithReply`

**Option A — `WKScriptMessageHandler` (iOS 8+, universal)**

```swift
// Register in WKWebViewConfiguration
config.userContentController.add(bridge, name: "capsule")
```

```swift
// Called on main thread — guaranteed
func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
) {
    guard let body = message.body as? String else { return }
    bridge.handleCall(body)
}
```

JavaScript side:
```javascript
window.webkit.messageHandlers.capsule.postMessage(JSON.stringify({ ... }))
```

**Limitation**: No return value — response must be sent back via `evaluateJavaScript`. This means managing a callId-to-Promise mapping in JS.

**Option B — `WKScriptMessageHandlerWithReply` (iOS 14+)**

```swift
config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "capsule")

func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
) {
    // message.body received on main thread
    // but replyHandler can be called from any thread
    bridge.handleCall(message.body as! String) { result, error in
        replyHandler(result, error)
    }
}
```

JavaScript side uses `await`:
```javascript
const result = await window.webkit.messageHandlers.capsule.postMessage(payload)
```

**Threading hazard with Option B**: The `replyHandler` closure captures WebKit internal state. It must be called exactly once — never twice, never dropped. Calling it from a background thread is allowed, but accessing `message.body` after the handler's scope is not. Swift's strict concurrency (`@MainActor`) conflicts with the protocol's non-isolated signature — use `MainActor.assumeIsolated(_:)` to assert main thread access.

**Decision for Capsule**:
- **Primary**: `WKScriptMessageHandler` (Option A) — iOS 8+, simpler threading model, proven in production (Capacitor, Cordova, Ionic all use this)
- **Enhancement**: Adopt `WKScriptMessageHandlerWithReply` for iOS 14+ as a progressive enhancement that eliminates the JS-side callId bookkeeping

---

### iOS: Native → JS

```swift
// Called on main thread
webView.evaluateJavaScript(
    "window.__capsule._resolve('\(callId)', \(resultJson))",
    completionHandler: nil
)
```

For modern WKWebView, prefer the async variant:
```swift
Task { @MainActor in
    try? await webView.evaluateJavaScript(
        "window.__capsule._resolve('\(callId)', \(resultJson))"
    )
}
```

---

### JS-Side Bridge Runtime (`@capsule/core`)

The web layer manages the Promise lifecycle:

```typescript
// packages/core/src/bridge.ts

type PendingCall = {
  resolve: (data: unknown) => void
  reject:  (err: CapsuleError) => void
}

const pending = new Map<string, PendingCall>()

// Called by Capsule to receive responses from native
window.__capsule = {
  _resolve(id: string, data: unknown) {
    pending.get(id)?.resolve(data)
    pending.delete(id)
  },
  _reject(id: string, code: number, message: string) {
    pending.get(id)?.reject(new CapsuleError(code, message))
    pending.delete(id)
  },
  _event(method: string, data: unknown) {
    eventBus.emit(method, data)
  }
}

export function call<T>(method: string, params: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    pending.set(id, { resolve: resolve as any, reject })

    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params })

    // Android path — __capsule_host is the Java object from addJavascriptInterface
    if ((window as any).__capsule_host?.postMessage) {
      (window as any).__capsule_host.postMessage(message)
      return
    }

    // iOS path — webkit.messageHandlers.capsule is from WKScriptMessageHandler
    ;(window as any).webkit?.messageHandlers?.capsule?.postMessage(message)
  })
}
```

**What already exists**: Capacitor's `@capacitor/core` package (`packages/core/src/bridge.ts` in the Capacitor monorepo) is MIT-licensed and solves exactly this. Study it rather than reinventing. The Capsule bridge will differ only in the JSON-RPC envelope format.

---

## Part 2 — Plugin Dispatch: How Bridge Calls Reach Plugin Methods

Once the native layer receives a JSON-RPC call, it needs to route `barcode.scan` to the `scan` method on `BarcodeScanner`. There are two approaches.

### Approach A — Reflection (simple, slight perf cost)

```kotlin
// BridgeRouter.kt
class BridgeRouter {
    private val registry = mutableMapOf<String, CapsulePlugin>()

    fun register(name: String, plugin: CapsulePlugin) {
        registry[name] = plugin
    }

    fun route(call: BridgeCall) {
        val parts      = call.method.split(".")          // "barcode.scan" → ["barcode", "scan"]
        val pluginName = parts[0]                        // "barcode"
        val methodName = parts[1]                        // "scan"
        val plugin     = registry[pluginName] ?: return call.reject(1001, "Plugin not found")

        // Reflection: find method by name on the plugin class
        val method = plugin.javaClass.methods
            .firstOrNull { it.name == methodName && it.isAnnotationPresent(BridgeMethod::class.java) }
            ?: return call.reject(1002, "Method not found")

        try {
            method.invoke(plugin, call)
        } catch (e: InvocationTargetException) {
            call.reject(1003, e.cause?.message ?: "Plugin error")
        }
    }
}
```

**What Capacitor does**: Reflection with a small cache layer. Fully production-proven.

### Approach B — Generated Dispatch Table (no reflection, faster)

At `capsule sync` time, the CLI generates:

```kotlin
// .capsule/android/src/.../CapsulePluginRegistry.kt  (AUTO-GENERATED)
object CapsulePluginRegistry {
    fun register(bridge: CapsuleBridge) {
        bridge.registerDispatch("barcode") { call ->
            val plugin = BarcodeScanner(bridge)
            when (call.method) {
                "scan"          -> plugin.scan(call)
                "onScanResult"  -> plugin.onScanResult(call)
                else            -> call.reject(1002, "Method not found: ${call.method}")
            }
        }
        bridge.registerDispatch("imageProcessor") { call ->
            val plugin = ImageProcessor(bridge)
            when (call.method) {
                "grayscale"  -> plugin.grayscale(call)
                else         -> call.reject(1002, "Method not found: ${call.method}")
            }
        }
    }
}
```

**No reflection at runtime. Generated from annotations at build time.**

**How the CLI generates this** — two feasible approaches:

1. **KSP (Kotlin Symbol Processing)**: Processes `@CapsulePlugin` and `@BridgeMethod` annotations at compile time. Google uses KSP for Hilt, Room, Dagger. Fast, correct, integrates with Gradle naturally. Requires writing a KSP processor as a separate module.

2. **CLI pre-scan** (simpler): The Capsule CLI reads and parses the Kotlin source files with a TypeScript regex/AST parser before the Gradle build, then writes the registry file. Slower to implement correctly but requires no Gradle plugin.

**Recommendation**: Start with **Approach A (reflection)** — it is what Capacitor uses and it works fine. Graduate to **Approach B with KSP** when performance profiling shows it matters (it usually won't for plugin dispatch — plugin method execution time dominates).

**What already exists**: The KSP processor infrastructure exists in Capacitor's `android/annotation-processor` module. It is MIT-licensed and can be studied directly.

---

## Part 3 — Language Feasibility Analysis

### Kotlin / Java — FULLY FEASIBLE ✅

**How it works**: Source files added to `android { sourceSets { main { java.srcDirs += [...] } } }` in the generated `build.gradle`. They compile as part of the same Gradle build as the capsule shell. Full access to Android SDK.

**What exists**: This is standard Android development. Capacitor plugins written in Kotlin/Java follow exactly this model. Zero novel engineering required.

**Gotchas**:
- Package name collisions — the CLI must enforce that plugin packages don't clash with `dev.capsule.*`
- ProGuard/R8 rules — plugins that use reflection need `-keep` rules in the generated `proguard-rules.pro`

---

### Swift / Objective-C — FULLY FEASIBLE ✅

**How it works**: Swift/ObjC files are added to the Xcode project target's `sources` list in the generated `.xcodeproj` or via Swift Package Manager's `sources:` array. They compile into the same app binary as the capsule shell.

**What exists**: Standard iOS development. Capacitor iOS plugins follow this model exactly.

**Gotchas**:
- Swift plugins need access to the capsule's bridge types — the `CapsuleBridge` module must be importable
- If mixing Swift and ObjC in the same plugin, a bridging header is needed — the CLI must generate it
- Swift 5.9+ strict concurrency warnings in `WKScriptMessageHandlerWithReply` implementations (see Part 1)

---

### C / C++ (Android NDK) — FEASIBLE, SIGNIFICANT COMPLEXITY ⚠️

**How it works**:

```
C source file → NDK (clang cross-compiler) → libmyplugin.so
                                                    ↓
            Java/Kotlin calls via JNI → System.loadLibrary("myplugin")
```

The JNI boundary requires a specific function signature:
```c
// Android NDK: function name must match Java package + class + method
// Package: com.yourapp.plugins  Class: ImageProcessor  Method: grayscale
JNIEXPORT jstring JNICALL
Java_com_yourapp_plugins_ImageProcessor_grayscale(
    JNIEnv* env,
    jobject thiz,
    jstring paramsJson
) {
    // process and return result JSON
    const char* params = (*env)->GetStringUTFChars(env, paramsJson, NULL);
    // ... do work ...
    return (*env)->NewStringUTF(env, resultJson);
}
```

**OR** use a Kotlin wrapper that calls into a pure-C shared library (cleaner):

```kotlin
// ImageProcessor.kt — thin Kotlin wrapper
@CapsulePlugin(name = "imageProcessor")
class ImageProcessor(bridge: CapsuleBridge) : CapsulePluginBase(bridge) {

    init { System.loadLibrary("image_processor") }

    @BridgeMethod
    fun grayscale(call: BridgeCall) {
        val result = nativeGrayscale(call.getString("path", ""))
        call.resolve(mapOf("path" to result))
    }

    private external fun nativeGrayscale(path: String): String  // JNI call
}
```

```c
// image_processor.c — pure C implementation
JNIEXPORT jstring JNICALL
Java_com_yourapp_plugins_ImageProcessor_nativeGrayscale(JNIEnv* env, jobject thiz, jstring path) {
    // actual image processing
}
```

The CLI generates `CMakeLists.txt` and the `externalNativeBuild` block in `build.gradle`:

```cmake
# .capsule/android/src/main/cpp/CMakeLists.txt  (auto-generated)
cmake_minimum_required(VERSION 3.22.1)
project("capsule_plugins")

add_library(image_processor SHARED
    ../../../../capsule-plugins/image-processor/android/image_processor.c
)
target_link_libraries(image_processor android log)
```

**What already exists**: Android NDK is mature and production-ready. The CMakeLists.txt generation is not difficult — about 20 lines of CLI code per C plugin.

**Real complexity**: The JNI layer is error-prone. Memory management (`GetStringUTFChars` must be matched with `ReleaseStringUTFChars`), exception handling, and thread safety are all developer responsibilities. The CLI cannot protect against these.

**Recommendation**: Support C/C++ plugins but document the JNI complexity clearly. Provide a Kotlin wrapper template that hides the raw JNI. Most developers should prefer Kotlin.

---

### C / C++ (iOS) — FULLY FEASIBLE, SIMPLER THAN ANDROID ✅

On iOS, C/C++ is a first-class citizen — Xcode projects have always mixed Objective-C, C, C++, and Swift. No JNI layer. A C function callable from Swift via a bridging header:

```c
// capsule-plugins/my-plugin/ios/fast_hash.c
#include "fast_hash.h"

const char* compute_hash(const char* input) {
    // xxHash or similar
}
```

```swift
// MyPlugin.swift — calls C directly after importing header
import Foundation
import CapsuleBridge

@objc(MyPlugin)
class MyPlugin: CapsulePlugin {
    @objc func hash(_ call: CapsuleBridgeCall) {
        let input  = call.getString("input") ?? ""
        let result = String(cString: compute_hash(input))   // direct C call
        call.resolve(["hash": result])
    }
}
```

The CLI adds the `.c` file to the Xcode target and generates the bridging header.

---

### Lua — PARTIALLY FEASIBLE, PLATFORM SPLIT ⚠️

This is the most nuanced case. The feasibility differs significantly between platforms.

#### Lua on Android — FULLY FEASIBLE ✅

**Option 1 — LuaJ (pure Java, recommended)**

LuaJ is a Lua 5.2 interpreter written in pure Java. No NDK, no native compilation, no `.so` files. Just a Maven dependency.

```groovy
// build.gradle (auto-added by CLI when a .lua plugin is detected)
implementation 'org.luaj:luaj-jse:3.0.1'
```

```kotlin
// LuaPluginHost.kt — hosts all .lua plugins
class LuaPluginHost(private val bridge: CapsuleBridge) : CapsulePluginBase(bridge) {

    private val globals = JsePlatform.standardGlobals()

    fun loadScript(name: String, assetPath: String) {
        val source = bridge.context.assets.open(assetPath).bufferedReader().readText()
        globals.load(source, name).call()
    }

    fun call(pluginName: String, method: String, params: Map<String, Any>, call: BridgeCall) {
        val onCall = globals.get("onCall") as? LuaFunction
            ?: return call.reject(4001, "Lua plugin missing onCall function")

        val luaParams = LuaTable()
        params.forEach { (k, v) -> luaParams.set(k, CoerceJavaToLua.coerce(v)) }

        val resolveFn = object : TwoArgFunction() {
            override fun call(a: LuaValue, b: LuaValue): LuaValue {
                call.resolve(CoerceLuaToJava.coerce(b, Map::class.java) as Map<String, Any>)
                return LuaValue.NIL
            }
        }

        val rejectFn = object : TwoArgFunction() {
            override fun call(a: LuaValue, b: LuaValue): LuaValue {
                call.reject(4002, a.tojstring())
                return LuaValue.NIL
            }
        }

        onCall.call(
            LuaValue.valueOf(method),
            luaParams,
            resolveFn,
            rejectFn
        )
    }
}
```

**Option 2 — LuaJIT NDK (higher performance)**

LuaJIT compiles Lua to native machine code (JIT compilation). Faster for CPU-intensive scripts. Requires NDK build for each ABI (arm64-v8a, x86_64). Pre-built NDK binaries exist in the open-source community but are not official.

**Decision**: Start with LuaJ (pure Java). Offer LuaJIT as an opt-in for performance-critical plugins.

---

#### Lua on iOS — BUNDLED ONLY, NO OTA UPDATES ⚠️

**The App Store 2.5.2 rule** directly restricts this:

> *"Apps may not download, install, or execute code which introduces or changes features or functionality of the app, including other apps."*
> — Apple App Store Review Guidelines 2.5.2

| Scenario | Allowed on iOS? |
|----------|----------------|
| `.lua` files bundled inside the app binary | ✅ Yes — interpreted at runtime but bundled at build time |
| Downloading new `.lua` scripts from a server | ❌ No — violates 2.5.2 |
| Updating `.lua` via CodeSync OTA | ❌ No — same violation |
| Using JavaScript in `WKWebView` (the web bundle) | ✅ Yes — explicit WebKit exemption |

**This means**: On iOS, Lua plugins are **static**. They ship with the app binary and can only change with a new app store release. There is no OTA update path for Lua on iOS.

**On Android**: No such restriction exists. Lua scripts can be included in the CodeSync bundle and updated OTA freely.

**Implementation**:
- On iOS, use the C Lua 5.4 interpreter compiled into the Xcode project (Lua is a C library, ~300KB)
- Scripts are read from `Bundle.main` (bundled assets) only — the host explicitly refuses to load scripts from external paths
- The `LuaPluginHost.swift` enforces this at runtime

```swift
class LuaPluginHost: CapsulePlugin {
    private var luaState: OpaquePointer?

    func loadBundledScript(name: String) {
        // ONLY loads from app bundle — never from Documents or network paths
        guard let url = Bundle.main.url(forResource: name, withExtension: "lua"),
              let source = try? String(contentsOf: url) else { return }
        luaL_dostring(luaState, source)
    }
}
```

**Summary for Lua**:

| | Android | iOS |
|-|---------|-----|
| Bundled scripts | ✅ LuaJ (pure Java) | ✅ Lua 5.4 C library |
| OTA script updates | ✅ Via CodeSync | ❌ App Store violation |
| JIT performance | ✅ Optional LuaJIT NDK | ❌ No JIT (Apple forbids writable+executable memory) |

> **Correction to previous doc**: The claim that "Lua plugins can be updated via CodeSync OTA on iOS" was **incorrect**. OTA Lua updates on iOS violate App Store guidelines. This capability is Android-only.

---

## Part 4 — Code Generation: TypeScript Types from Native Annotations

This eliminates handwritten TypeScript bridges. The developer annotates Kotlin/Swift; the CLI generates the `.ts` file.

### Android: KSP Processor

```kotlin
// @BridgeMethod and @BridgeParam are processed by the Capsule KSP processor

@CapsulePlugin(name = "barcode")
class BarcodeScanner {

    @BridgeMethod
    @Returns(BarcodeResult::class)
    fun scan(
        @BridgeParam("quality") quality: Float,
        @BridgeParam("facing")  facing: String
    ): Unit

    @BridgeEvent
    @Emits(BarcodeResult::class)
    fun onScanResult(): Unit
}

@BridgeType
data class BarcodeResult(
    val value: String,
    val format: String
)
```

**KSP processor output**:
```typescript
// AUTO-GENERATED — do not edit. Run `capsule generate types` to regenerate.

export interface BarcodeResult {
  value: string
  format: string
}

export const barcode = {
  scan(params: { quality?: number; facing?: 'front' | 'back' }): Promise<BarcodeResult> {
    return capsuleBridge.call('barcode.scan', params)
  },
  onScanResult(handler: (data: BarcodeResult) => void): () => void {
    return capsuleBridge.subscribe('barcode.onScanResult', handler)
  }
}
```

**What exists**: Writing a KSP processor is ~300 lines of Kotlin. Google's KSP documentation is comprehensive, and Capacitor's existing annotation processor (KAPT-based) is a direct reference to port to KSP.

### iOS: Swift Macros (Swift 5.9+)

```swift
@CapsulePlugin("barcode")      // Swift attached macro
class BarcodeScanner: CapsulePlugin {

    @BridgeMethod               // macro marks this for TS generation + dispatch registration
    func scan(quality: Float, facing: String) async throws -> BarcodeResult { ... }
}
```

The Swift macro generates:
1. The Objective-C `@objc` exposure needed for the runtime bridge
2. A `.d.ts` snapshot file that `capsule generate types` collects into the final TypeScript output

**What exists**: Swift macros are new (Xcode 15+, Swift 5.9). No existing framework does this yet. Sourcery is the mature alternative — it uses SwiftSyntax to parse Swift files and generate code from templates. Sourcery is used in 40,000+ projects (Airbnb, Bumble, NYT). Either approach works; Swift macros are more elegant but require Xcode 15.

---

## Part 5 — Plugin Threading Model

Getting threading wrong causes random crashes and ANR (Application Not Responding) errors. This must be defined as an explicit contract.

### Android Threading Rules

| Context | Thread | Rule |
|---------|--------|------|
| `@JavascriptInterface` method (entry point) | WebView background thread | Never do UI work here |
| `call.resolve()` / `call.reject()` | Any thread | Safe — internally dispatches to main for `evaluateJavascript` |
| UI operations (launch camera, show dialog) | Must be main thread | Use `bridge.activity.runOnUiThread { }` |
| Long-running work (file I/O, network) | Background thread | Use `CoroutineScope(Dispatchers.IO)` or `bridge.async { }` |

The `CapsulePluginBase` provides helpers:
```kotlin
abstract class CapsulePluginBase(protected val bridge: CapsuleBridge) {
    protected fun onMain(block: () -> Unit) = bridge.activity.runOnUiThread(block)
    protected fun onIO(block: suspend () -> Unit) = bridge.coroutineScope.launch(Dispatchers.IO) { block() }
}
```

### iOS Threading Rules

| Context | Thread | Rule |
|---------|--------|------|
| `WKScriptMessageHandler.didReceive` | Main thread | Safe for UI; dispatch off main for heavy work |
| `call.resolve()` / `call.reject()` | Any thread | Safe |
| Heavy computation | Background | `DispatchQueue.global(qos: .userInitiated).async { }` |
| Camera / permissions | Main thread required | Must dispatch back |

---

## Part 6 — Error Boundaries and Plugin Crashes

An uncaught exception inside a plugin method must not crash the entire app.

### Android

The `BridgeRouter` wraps every plugin invocation:

```kotlin
fun route(call: BridgeCall) {
    try {
        dispatch(call)
    } catch (e: Exception) {
        // Plugin threw — reject the call, log, do not rethrow
        Log.e("CapsuleBridge", "Plugin error in ${call.method}", e)
        call.reject(4999, "Plugin error: ${e.message}")
    }
}
```

Additionally, Kotlin coroutine exceptions need a `CoroutineExceptionHandler`:
```kotlin
val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
    Log.e("CapsuleBridge", "Unhandled plugin coroutine error", throwable)
    // notify developer in debug mode; silence in production
}
```

### iOS

```swift
func route(_ call: CapsuleBridgeCall) {
    do {
        try dispatch(call)
    } catch {
        NSLog("CapsuleBridge: Plugin error in \(call.method): \(error)")
        call.reject(.pluginError, error.localizedDescription)
    }
}
```

Objective-C exceptions (from legacy ObjC plugins) require a separate `@try/@catch` wrapper since Swift does not catch ObjC exceptions by default.

---

## Part 7 — The `capsule eject` Command (Forking an npm Plugin)

### What "eject" actually means

An npm binary plugin ships an AAR (which is just a zip file of compiled `.class` files, resources, and a manifest). Decompiling it with tools like `jadx` produces readable Java — but that's a workaround, not a first-class path.

**The correct approach**: Require all official and community plugins to publish source code. The `capsule-plugin.json` manifest includes a `sourceRepo` field:

```json
{
  "name": "@capsule/camera",
  "sourceRepo": "https://github.com/capsule-framework/plugin-camera",
  "sourceBranch": "main"
}
```

`capsule eject @capsule/camera` then:
```
1. Read capsule-plugin.json from node_modules/@capsule/camera/
2. Read sourceRepo field
3. git clone --depth=1 {sourceRepo} capsule-plugins/camera
4. Remove @capsule/camera from capsule.config.ts plugins array
5. Add ./capsule-plugins/camera to plugins array
6. Run capsule sync to rebuild registry
```

The developer now owns the full source. Modifications compile from source at every `capsule build`.

**For closed-source third-party plugins** with no `sourceRepo`: eject is not available. The CLI should say so explicitly rather than attempting decompilation.

---

## Part 8 — What Already Exists to Reuse

| Component | Project | License | Reuse approach |
|-----------|---------|---------|----------------|
| Android bridge core | Capacitor `android/capacitor` | MIT | Study implementation; do not fork (different bridge protocol) |
| iOS bridge core | Capacitor `ios/Capacitor` | MIT | Same |
| JS bridge runtime | Capacitor `core/src/bridge.ts` | MIT | Fork and adapt for JSON-RPC 2.0 envelope |
| Lua on Android | LuaJ (`luaj/luaj`) | MIT | Add as Maven dependency directly |
| Lua on iOS | Lua 5.4 C source | MIT | Include C source directly in Xcode target |
| Android KSP | Google KSP (`google/ksp`) | Apache 2.0 | Write Capsule's own processor using KSP API |
| iOS code generation | Sourcery (`krzysztofzablocki/Sourcery`) | MIT | Use as a build phase tool |
| NDK CMake integration | Standard Android NDK | — | CLI generates CMakeLists.txt (20 lines) |
| Swift macros | Swift standard library 5.9+ | — | Write Capsule's own attached macros |
| TypeScript bridge types | N/A | — | Generated by CLI from annotations; novel |

---

## Part 9 — Plugin Lifecycle

```
App cold start
     │
     ▼
CapsuleShell.onCreate()
     │
     ├─ Load all plugin instances (eager, synchronous)
     │    Plugin.load() called — reserve resources, open DB connections
     │
     ├─ WebView created and configured
     │    addJavascriptInterface / WKScriptMessageHandler registered
     │
     ├─ Web bundle loaded
     │    Phase 1: file:///android_asset/www/ (dev server in debug mode)
     │    Phase 2+: CapsuleRuntime starts the server, navigates WebView to
     │              http://127.0.0.1:{port}/ after server is ready
     │    DOMContentLoaded fires
     │    Web code imports plugins from @capsule/core
     │
     └─ App is live — bridge calls can now flow


App goes to background
     │
     └─ Plugin.pause() called — release camera, pause sensors

App returns to foreground
     │
     └─ Plugin.resume() called — reacquire resources, re-check permissions

App destroyed
     │
     └─ Plugin.destroy() called — close DB, release memory
```

Plugins that do not override `pause()`/`resume()`/`destroy()` get no-op defaults.

---

## Part 10 — Full Plugin Project Layout

```
my-app/
  capsule-plugins/
    barcode/
      capsule-plugin.json       # permissions, platform declarations
      android/
        BarcodeScanner.kt       # Kotlin implementation
        BarcodeScanner.java     # OR Java (not both)
        native/
          barcode_fast.c        # optional C acceleration
          barcode_fast.h
      ios/
        BarcodeScanner.swift    # Swift implementation
        barcode_fast.c          # C available directly on iOS too
      lua/
        logic.lua               # scripting layer (Android OTA; iOS bundled-only)
      web/
        index.ts                # TypeScript bridge (manual or auto-generated)
        index.d.ts              # types (auto-generated)

  capsule.config.ts             # plugins listed here or auto-discovered
  package.json
```

---

## Summary: Feasibility Matrix

| Language | Android | iOS | OTA updatable | Complexity | What exists |
|----------|---------|-----|--------------|------------|-------------|
| Kotlin | ✅ Full | N/A | ❌ Native | Low | Capacitor pattern (proven) |
| Java | ✅ Full | N/A | ❌ Native | Low | Same |
| Swift | N/A | ✅ Full | ❌ Native | Low | Capacitor pattern (proven) |
| Objective-C | N/A | ✅ Full | ❌ Native | Medium | Proven, legacy |
| C/C++ (NDK) | ✅ Full | ✅ Full | ❌ Native | High (JNI) | NDK mature; JNI is error-prone |
| Lua | ✅ LuaJ (pure Java) | ✅ Lua 5.4 C lib | Android ✅ / iOS ❌ | Medium | LuaJ MIT licensed |
| LuaJIT | ✅ NDK build | ❌ Apple forbids W+X memory | Android ✅ / iOS ❌ | High | Community NDK builds |
