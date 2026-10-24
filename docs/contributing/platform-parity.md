---
title: "Android and iOS parity"
audience: contributor
status: current
---
# Android ↔ iOS Parity — Languages & Tooling

> The cross-platform map of Capsule's languages and tooling, layer by layer. Use it to see, at
> a glance, what is **shared** (the contract / the JS brain), what is **re-coded** (pure logic),
> and what is **per-platform plumbing** (the edge). Companion to the iOS bring-up plan
> ([ios-bring-up.md](ios-bring-up.md)) and the contract-readiness audit there.
>
> **Web serving is decided** — embedded loopback HTTP server on **both** platforms — the **same**
> CivetWeb C sources (`packages/native/civetweb`, adr-004 amendment 2026-10-24); `WKURLSchemeHandler` and `https://localhost` were considered and rejected. See
> **[adr-004](../decisions/0004-web-serving-transport.md)** for the rationale and the HTTP
> fidelity tiers (request/response + streaming now; WebSockets/SSE deferred-by-design).

Where iOS has a real choice, the chosen option is **bold**; rejected/alternative options are noted.

## Languages
| Layer | Android | iOS |
|---|---|---|
| Shell language | Kotlin | **Swift** |
| Native engine lib | C (QuickJS-ng, vendored) | C (same source, unchanged) |
| Core SDK | TypeScript (`@capsule/core`) | TypeScript (same — runs in QuickJS, platform-agnostic) |
| CLI | TypeScript / Node | TypeScript / Node (same) |
| Async model | Kotlin coroutines (`suspend`) | **Swift `async/await`** / completion handlers |
| Wire serialization | kotlinx.serialization (`@Serializable`/`@SerialName`) | **`Codable` + `CodingKeys`** (must emit identical JSON) |

## Runtime / engine
| Layer | Android | iOS |
|---|---|---|
| JS engine | QuickJS-ng (JNI) | **QuickJS-ng (same C + Swift/C interop)** · ~~JavaScriptCore~~ (rejected — different constraints, splits the contract) |
| Engine glue | `quickjs_jni.c` (120 lines JNI) | thin C shim + Swift wrapper (rewrite ~120 lines) |
| Engine threading | single-thread `Executor` + 4 MB stack | serial `DispatchQueue` / `Thread(stackSize:)` — **must replicate the 4 MB stack-base rule** |
| **Web-serving transport** | **CivetWeb** (C) via JNI — `CivetwebServer.kt` + `capsule_server_jni.c`, loopback `http://127.0.0.1:{port}/` | **CivetWeb** (the same C sources) via the `CCivetweb` SwiftPM target — `CivetwebServer.swift`, loopback `http://127.0.0.1:{port}/` — **one server, symmetric** (adr-004) · ~~WKURLSchemeHandler~~, ~~https~~ rejected |
| Web-serving scheme | `http://127.0.0.1:{port}/` (loopback, secure context) | `http://127.0.0.1:{port}/` (same — loopback `http`, `NSAllowsLocalNetworking` ATS exception) |
| Asset + `/api/*` routing | `RequestRouter.kt`: `www/` assets + `/api/*` → QuickJS | `RequestRouter.swift`: the same rules, case-for-case tests (**same router, same QuickJS brain**) |
| HTTP fidelity | static + req/res + streaming **now**; WebSockets/SSE/range **future** (adr-004 #5) | identical — same tiers, same core route model |

## WebView / UI shell
| Layer | Android | iOS |
|---|---|---|
| WebView | `android.webkit.WebView` | `WKWebView` |
| JS → native bridge | `@JavascriptInterface` (`CapsuleBridge`) | **`WKScriptMessageHandler`** (`WKUserContentController`) |
| native → JS | `WebView.evaluateJavascript()` | `WKWebView.evaluateJavaScript()` / `callAsyncJavaScript()` |
| Navigation / splash | `WebViewNavigator` / `WebViewSplashController` | `WKWebView.load()` + `LaunchScreen.storyboard` / native `UIView` |
| Chrome / permissions / console | `WebChromeClient` + `WebViewClient` | `WKUIDelegate` + `WKNavigationDelegate` |

## Composition root & lifecycle
| Layer | Android | iOS |
|---|---|---|
| App entry / root | `CapsuleActivity` (Activity, 309 lines) | **`AppDelegate` + `SceneDelegate`** + a `UIViewController` host |
| App lifecycle source | `ProcessLifecycleOwner` + Activity intents | `UISceneDelegate` (`scenePhase`) / `UIApplication` notifications |
| Server re-bind on resume | (server survives) | **re-bind on `sceneWillEnterForeground`** — the background-socket discipline (adr-004) |
| Deep links | manifest `intent-filter` + `onNewIntent` (CLI-generated) | **Universal Links** (`apple-app-site-association`) + URL schemes (`CFBundleURLTypes`) → `onOpenURL` |

## Capability providers (per-API native impl)
| API | Android | iOS |
|---|---|---|
| Camera | `AndroidCameraProvider` (Camera intent / PhotoPicker) | `PHPickerViewController` + `UIImagePickerController` (capture) |
| Filesystem | `AndroidFilesystemProvider` (`java.io.File`, `filesDir`/`cacheDir`) | `FileManager` (Documents / Caches `URL`s) |
| Network status | `AndroidNetworkProvider` (`ConnectivityManager` callback) | `NWPathMonitor` (Network framework) |
| Geolocation | `FusedLocationProvider` (Play Services) | `CLLocationManager` (CoreLocation) |
| Haptics | `AndroidHapticsProvider` (`Vibrator`/`VibrationEffect`) | `UIFeedbackGenerator` / Core Haptics (`CHHapticEngine`) |
| Alerts | `AndroidAlertsProvider` (`AlertDialog`) | `UIAlertController` |
| Clipboard | `AndroidClipboardProvider` (`ClipboardManager`) | `UIPasteboard` |
| Device info | `AndroidDeviceInfoProvider` (`Build`) | `UIDevice` + `ProcessInfo` |
| KV storage | `AndroidStorageProvider` (`SharedPreferences`) | `UserDefaults` |
| Push | `FirebaseMessaging` + `NotificationManager` (channels) | **`UNUserNotificationCenter` + APNs** (`registerForRemoteNotifications`) · FCM iOS SDK optional. *Channels = Android-only, no-op on iOS* |
| Permissions | `AndroidPermissionManager` (`requestPermissions`, central) | **per-framework requests** (no central API): `AVCaptureDevice`, `CLLocationManager`, `UNUserNotificationCenter`, `PHPhotoLibrary` |

## Runtime infra (Phase 2 / OTA)
| Layer | Android | iOS |
|---|---|---|
| Crash log | `PrefsCrashLog` (`SharedPreferences`) | `UserDefaults`-backed |
| Bundle store | `FileBundleStore` (`java.io.File`) | `FileManager`-backed *(soften the `File` signature first — see 080)* |
| Clock | `System.currentTimeMillis` | `Date` / `DispatchTime` |
| Shared logic (tier-2) | pure Kotlin controllers | **re-coded in Swift** · *or* shared via KMP (mature, deferred — see 080) |

## Build, test & ship
| Layer | Android | iOS |
|---|---|---|
| Build system | Gradle + AGP | **Xcode / `xcodebuild`** (+ Fastlane) · SwiftPM possible |
| Native build | CMake + Android NDK (clang) | Xcode clang (iOS SDK) · SwiftPM C target |
| Output artifact | AAR (+ APK/AAB) | XCFramework (+ `.app`/`.ipa`) |
| Dependency mgmt | Gradle (Maven) | **SwiftPM** · CocoaPods |
| Min platform | `minSdk` 26 (Android 8) | **deployment target — decide** (iOS 15? 16?) |
| Signing | debug/release keystore (`apksigner`) | code signing + provisioning profiles + **Apple Developer Program ($99/yr)** |
| Publishing | `capsule build/run android` → Play Store | `capsule publish ios` → App Store / TestFlight (Fastlane) |
| Unit tests | JUnit + Kotlin (JVM, fakes) | **XCTest / Swift Testing** (fakes) |
| Integration / instrumented | `androidTest` on emulator/device | XCTest on **Simulator** (+ device) |
| E2e | emulator + Samsung device | Simulator now → iPhone (deferred to Mac mini) |
| CI | GitHub Actions `android` (+ opt-in `android-instrumented`) | GitHub Actions `ios-linux` + `ios-macos` |

---

## Open decisions still to revise

1. **iOS deployment target** — picks the WebView/Swift baseline; unset.
2. ~~**Embedded server library**~~ — **decided 2026-10-24:** CivetWeb on both platforms (adr-004 amendment); pin tracked in [upkeep.md](upkeep.md).
3. **SwiftPM vs CocoaPods**, and **XCTest vs Swift Testing** — both lean modern.
4. **Tier-2 sharing: hand-port vs KMP** — deferred; revisit if the CodeSync-client surface grows.
5. **Push: APNs-direct vs FCM-iOS-SDK** — direct APNs is lighter; FCM gives one server API for both platforms.

*Resolved (no longer open): web-serving transport → embedded server both platforms ([adr-004](../decisions/0004-web-serving-transport.md)).*
