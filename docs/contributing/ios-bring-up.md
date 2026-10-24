---
title: "iOS bring-up"
audience: contributor
status: current
code:
  - Package.swift
  - packages/capsule-ios/Sources/dev/capsule/*.swift
---
# iOS Bring-Up — Without Buying a Mac (Yet)

> How to make real iOS progress before owning Apple hardware, and how it sequences against
> monetization. Decided in the 2026-06-15 strategy session. Architecture target: CivetWeb (the same
> embedded server Android runs — adr-004 amendment, 2026-10-24) + QuickJS compiled for iOS + WKWebView shell, same `capsule.config.ts`, same TS route
> handlers — see [../decisions/0001-embedded-runtime.md](../decisions/0001-embedded-runtime.md).

---

## Where iOS sits

**Phase 4** — after native-API expansion (Phase 3), before the Server Code Push / OTA cloud (Phase 6).
Capsule is a personal project, so capability comes first: finish the native APIs on Android, *then*
bring up iOS so the platform is cross-platform **before** the OTA cloud — which is gated on iOS, since
almost nobody pays for an Android-only OTA service ([../project/business/business-model.md](../project/business/business-model.md)).
This still pulls iOS forward from its old Phase 6 slot. See [roadmap.md](../project/roadmap.md).

---

## You do not need a physical device to make progress

The iOS **Simulator** covers the non-device-dependent layers — exactly the **unit + integration**
tiers of the 3-tier test strategy. Only the **e2e tier** (real iPhone, performance, App Store
submission, signing) truly needs a Mac mini, and that's the part deferred until the OTA business funds
the hardware.

| Capability | macOS VM (recent macOS, VirtualBox/VMware) | GitHub Actions macOS |
|---|---|---|
| Compile Swift + QuickJS-for-iOS | ✅ | ✅ |
| iOS **Simulator** tests (WKWebView, scheme handler, logic) | ✅ (slow on x86 host) | ✅ |
| Interactive native debugging | ✅ (the VM's only real edge) | ❌ batch: push → wait → read logs |
| Real device / signing / submission | ❌ | ❌ |
| Legal / stable | ❌ EULA-gray, fragile | ✅ real Apple HW, sanctioned |

### Hard stops

- **macOS Lion (2011) is useless** — can't run modern Xcode, can't target current iOS, can't submit.
  If you VM at all, use a **recent macOS (Sonoma/Sequoia)**.
- **Virtualizing macOS on non-Apple hardware violates Apple's EULA.** Acceptable for throwaway personal
  bring-up; **never** bake it into CI or anything customer-facing.

---

## Free macOS CI — GitHub Actions on the public repo

The repo is public, so **GitHub-hosted macOS runners are free and unmetered** — no minute quota, no
multiplier, no grant to request. The `ios-macos` job in `.github/workflows/ci.yml` runs `swift test`
on `macos-latest` on every push and pull request, next to the Linux container run (`ios-linux`); see
[ci.md](ci.md). Locally, `pnpm verify:ios` runs the Linux half in Docker — no Mac needed.

> History: while the repo was private, Azure Pipelines was the planned macOS CI because it billed macOS
> minutes 1:1 instead of GitHub's 10× multiplier. Going public (2026-10-24) removed the reason.

---

## Contract readiness — assessed 2026-06-26

An audit of the Android contracts (every runtime + provider interface, the protocol/event layer,
the shared controllers, the platform-edge wiring, and the native QuickJS C/JNI layer) against the
question *"how far are these from being iOS-portable?"*

**Verdict: the contracts are essentially iOS-ready — no interface needs redesign to support iOS.**
The "interface + provider + Fake" discipline placed the cross-platform seam at the
**provider/controller boundary, not at the Android plumbing underneath**. Of all the *contract*
files (i.e. excluding the `Android*`/`Fused*`/server implementations), only three leak
`android.*`/`androidx.*` into a signature — and all three are genuine platform-edge glue
(`CapsuleBridge` → `WebView`/`JavascriptInterface`; `activity/ActivityResultBroker` +
`activity/SuspendingActivityLauncher` → Activity-result helpers). Every *interface* is clean.

Porting cost falls into four tiers:

1. **Transliterate 1:1 to Swift protocols (zero redesign).** All runtime interfaces
   (`CapsuleServer`, `QuickJSEngine`, `QuickJSBridge`+`HttpRouteResponse`, `AppNavigator`,
   `SplashController`, `BundleStore`, `CrashLog`, `Clock`, `QuickJSException`), all provider
   interfaces (`CameraProvider`, `FilesystemProvider`, `NetworkProvider`, `LocationProvider`,
   `PushProvider`, `PermissionManager` + their data classes/enums), and the protocol layer
   (`BridgeEventEmitter`, `CapabilityRegistry`, `BridgeError`, `JsonRpcModels`, `BridgeHandler`).
   They use only Kotlin primitives, `suspend` (→ Swift `async`), callbacks (→ closures/delegates),
   and a couple of JVM types. Each interface's KDoc already names its iOS impl.
2. **Pure-JVM shared *logic* — re-coded in Swift, but trivial and test-locked.**
   `NetworkStatusController`, `PushController`, `AppLifecycleController`, `CapabilityRegistry`,
   `CrashLoopGuard` logic. These own **zero** Android types (in a KMP setup they'd be literally
   shared). Each has a pure-JVM unit suite pinning exact behaviour (de-dup, consume-once launch
   URL/notification, "3 crashes in 60s"). Low risk.
3. **Platform-edge — rewritten per platform (the point of the seam, not a gap).** `CapsuleBridge`
   → `WKScriptMessageHandler`; every `Android*`/`Fused*` provider → Swift; the embedded server →
   **already done**: `CivetwebServer.swift` over the same CivetWeb C sources (2026-10-24); navigator/splash → WKWebView; `PrefsCrashLog` → UserDefaults; `FileBundleStore` →
   FileManager (logic portable, IO swapped); `CapsuleActivity` (309-line composition root) →
   AppDelegate/SceneDelegate. `ActivityResultBroker`/`SuspendingActivityLauncher` have **no iOS
   analog needed** — iOS uses delegate callbacks.
4. **Native engine — the pleasant surprise.** QuickJS-ng is vendored as **plain C** (`quickjs.c`,
   `libregexp.c`, `libunicode.c`, `dtoa.c`) and compiles for iOS *unchanged*. Only `quickjs_jni.c`
   (120 lines) is Android-specific; its core `__capsule_call` JSON round-trip helper is embedded JS,
   fully portable. iOS replaces just the JNI glue with a C/Swift bridge. **Carry-over correctness
   constraint:** the single-thread dispatcher + 4 MB stack-base requirement in `QuickJSEngineImpl`
   must be replicated in the Swift port (QuickJS records the JS stack base from the creating thread).

**Portability backbone + the one real risk.** There is no Kotlin-Multiplatform, so contracts are
*hand-transliterated* to Swift, not literally shared → contract-drift risk. What de-risks it: every
Kotlin data class explicitly mirrors `@capsule/core`'s TS types, and the **wire JSON** is the true
contract (locked by kotlinx `@SerialName` on Android; matched on iOS by `Codable` + `CodingKeys`).
So **`@capsule/core` is the shared source of truth that keeps both shells honest** — the cross-check
that protects the hand-port.

**One interface nit to fix before the port:** `BundleStore` exposes `java.io.File`
(`activeDir(): File?`, `install(staged: File)`) and `FilesystemProvider`'s KDoc references
`java.io.File` plumbing. A neutral path/URI type would make `BundleStore` a literal shared contract.
Minor — every other interface is already platform-neutral.

---

## Recommended path

1. **Now (no Mac):** write the Swift/QuickJS port **interface-first**, in parallel with the proven
   Android architecture — most of this is just code that doesn't need to compile on macOS yet. Mirror
   the Android interface set (cross-platform seams confirmed by the 2026-06-26 readiness audit above):

   | Android | iOS equivalent | Tier |
   |---|---|---|
   | runtime + provider + protocol interfaces (`CapsuleServer`, `QuickJSEngine`, `QuickJSBridge`, `*Provider`, `BridgeEventEmitter`, `BridgeError`, …) | same contracts as Swift protocols | 1 — transliterate 1:1 |
   | `AppLifecycleController` / `NetworkStatusController` / `PushController` / `CapabilityRegistry` / `CrashLoopGuard` logic | re-coded in Swift, behaviour pinned by the JVM unit suites | 2 — shared logic |
   | `CivetwebServer` (CapsuleServer) + `RequestRouter` | `CivetwebServer.swift` + `RequestRouter.swift` over the **same** CivetWeb C sources — ✅ built, 17 tests green on Linux | 3 — platform edge (done) |
   | `QuickJSEngineImpl` (JNI) | same vendored QuickJS **C** + Swift/C bridge (keep the single-thread + 4 MB stack-base rule) | 3/4 — re-glue only |
   | `CapsuleBridge` (`@JavascriptInterface`) | `WKScriptMessageHandler` | 3 — platform edge |
   | `WebViewNavigator` / `WebViewSplashController` | WKWebView equivalents | 3 — platform edge |
   | `CivetwebServer` → `http://127.0.0.1:{port}/` | **`CivetwebServer.swift` → same `http://127.0.0.1:{port}/`** (embedded server, symmetric — adr-004) · ~~`WKURLSchemeHandler`~~ rejected | 3 — platform edge |
   | `FileBundleStore` / `PrefsCrashLog` | same interfaces; iOS impls (FileManager / UserDefaults) | 3 — platform edge |
   | `CapsuleActivity` (composition root) | AppDelegate / SceneDelegate | 3 — platform edge |
   | `activity/ActivityResultBroker`, `SuspendingActivityLauncher` | no analog — iOS uses delegate callbacks | — drop |

   **Why the iOS shell serves the bundle from an embedded loopback HTTP server — not
   `WKURLSchemeHandler`, and not `https://localhost`** (full rationale: [adr-004](../decisions/0004-web-serving-transport.md)):
   - **Embedded server, not a scheme handler.** `WKURLSchemeHandler` is lighter, but it **can't
     serve WebSockets**, is a thinner HTTP emulation (streaming/range/POST-body sharp edges), and
     makes the platforms **asymmetric** (Android *must* run a real server — its WebView intercept
     API can't read POST bodies). A real `CapsuleServer` (CivetWeb, the same C server as Android) on iOS keeps `/api`
     semantics identical to Android and unlocks the HTTP fidelity tiers. Scheme handler is recorded
     as *considered and rejected* in adr-004 #2.
   - **`http` loopback, not `https`.** TLS on loopback needs a cert the WebView **trusts**; no public
     CA issues one for `127.0.0.1`/`localhost`, and a self-signed cert means per-device trust-anchor
     provisioning (fragile). Plain `http` on loopback is already a stable, app-controlled,
     **secure-context** origin — so `localStorage` / `IndexedDB` / service workers / CORS behave
     correctly. `https` buys nothing and costs a cert burden. (iOS needs the one-line
     `NSAllowsLocalNetworking` ATS exception for cleartext loopback; that's it.)
   - **Background-socket discipline:** re-bind the server on `sceneWillEnterForeground`; long-lived
     connections reconnect on foreground (standard mobile-web behaviour). See adr-004 realism notes.

2. **Build + Simulator tests:** **GitHub Actions macOS** (free on the public repo — see above). Optional recent-macOS VM as an
   interactive scratchpad for native debugging, accepting it's gray/throwaway.
3. **Real-device e2e + signing + App Store:** defer to the Mac mini (~$599), bought when OTA revenue
   funds it. Until then, `capsule publish ios` (Fastlane path in [publishing.md](../guide/publishing.md))
   is designed but unexercised on real submission.

---

## Test-strategy alignment

This keeps iOS honest with the existing 3-tier strategy that must hold on both platforms:

- **Unit + integration:** run in CI/Simulator now (no device).
- **e2e:** real iPhone, deferred to hardware.
