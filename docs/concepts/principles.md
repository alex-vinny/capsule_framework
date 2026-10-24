---
title: "Principles"
audience: everyone
status: current
---
# Capsule Framework — Architecture Guidance

> **Capsule** — *app ships inside a managed native capsule.*

---

## Core Architectural Principles

> **The native shell is a dependency, not source code.**

Developers never edit Android Gradle files or Xcode projects. The shell is versioned like any npm/maven package. SDK update = bump a version number.

> **Shell = native OS capabilities. Plugins = code-logic integrations.**

The shell always delivers every native OS API (camera, GPS, NFC, Bluetooth, haptics, biometrics, push, calls, filesystem, DB, etc.) — unused ones are tree-shaken by R8/linker at app build time. What the shell does **not** include: third-party SDK wrappers, auth providers, analytics, payment SDKs, or any integration whose value is code logic rather than hardware access. Those are community plugins. This line is a hard boundary — crossing it would couple the shell to third-party release cycles and bloat every app with SDKs it doesn't use.

> **HTTP = data. Bridge = events. No mixing.**

The embedded HTTP server (CivetWeb on both platforms — adr-004) handles request/response data flows — API calls, SSR, mutations. The Bridge (JavascriptInterface) handles push and events — native APIs, real-time updates, sensor streams. These two channels are never mixed. WebSockets/SSE in the embedded server are deferred-by-design future fidelity features (see [adr-004](../decisions/0004-web-serving-transport.md)), not part of the current minimal surface.

> **Invisible infrastructure.**

The embedded HTTP server, QuickJS runtime, port numbers, and bundle format are implementation details. Developers write a web app. They never encounter the HTTP server, QuickJS, ports, or bundles in their `capsule.config.ts`, CLI output, or documentation. Crash recovery is silent. Rollback is silent. The framework's complexity is invisible.

> **Interfaces + fakes are mandatory.**

Every new component ships with an interface and a fake implementation on the same day. No exceptions. This is not a testing preference — it is the architecture. `CapsuleServer` + `FakeCapsuleServer`, `QuickJSEngine` + `FakeQuickJSEngine`, `SplashController` + `FakeSplashController`. All `CapsuleRuntime` behavior is covered by pure JVM unit tests with no device needed.

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer's App                           │
│   src/  (React / Vue / Svelte / Vanilla)                    │
│   src/server/routes/  (optional — activates full stack)     │
│   capsule.config.ts  (single config file)                   │
└──────────────┬──────────────────────────────────────────────┘
               │  CLI (capsule tooling)
┌──────────────▼──────────────────────────────────────────────┐
│         CLI Build Layer                                      │
│   Client: Vite/ng build → assets/www/                       │
│   Server: esbuild → assets/server/bundle.js (if routes/)    │
└──────────────▼──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│       @capsule/core SDK (TypeScript)                        │
│   Camera · GPS · Push · Bluetooth · NFC                     │
│   Haptics · Biometrics · Filesystem · ...                   │
│   Database · Preferences · Browser ·                        │
│   InlineWebView · All platform APIs —                       │
│   tree-shaken on build                                      │
│   CodeSync built-in (opt-in via config)                     │
│                                                             │
│   Bridge implementations:                                   │
│     CapsuleBridge  — WebView + native shell          ✅     │
│     WebBridge      — browser dev fallback            ✅     │
│     FakeBridge     — unit tests                      ✅     │
│     QuickJSBridge  — server route handlers     (Phase 2)    │
└──────────────┬──────────────────────────────────────────────┘
               │  JSON-RPC 2.0 messages
┌──────────────▼──────────────────────────────────────────────┐
│     CapsuleRuntime (Phase 2 — coordinator)                  │
│   CapsuleServer (CivetWeb — same C server on both)          │
│   QuickJSEngine (on-device JS runtime)                      │
│   SplashController (readiness + timeout)                    │
│   CapsuleBridge (JavascriptInterface / WKScriptMessage)     │
│   CodeSyncManager (rollback on crash loop)                  │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│     Native Capsule (binary dependency)                      │
│   Android: AAR via Maven                                    │
│   iOS: XCFramework via Swift Package                        │
│   Hosts WebView + full platform API layer                   │
│   WebView loads from http://127.0.0.1:{port}/  (Phase 2+)  │
│   WebView loads from dev server URL in dev mode             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. The CLI (`@capsule/cli`) ✅ Done

This is the backbone. All native complexity lives here, not in the developer's project.

```
# ── Project setup ────────────────────────────────────────────────────────────
capsule init                              # scaffold a new project (interactive template selection)
capsule init --template react-ts          # scaffold with a specific template
capsule init --template vue-ts            #   available: react-ts | vue-ts | svelte-ts | vanilla-ts
capsule init --template github:org/tmpl   # community template from GitHub
capsule add android                       # add Android platform
capsule add ios                           # add iOS platform (Phase 4+)
capsule sync                              # regenerate .capsule/ wrappers from capsule.lock
capsule sync --frozen-lockfile            # CI mode — fails if lock is out of date
capsule update                            # update capsule shell to latest compatible version

# ── Development ───────────────────────────────────────────────────────────────
capsule dev                               # start dev server(s) + hot reload
                                          # starts Vite/ng for client
                                          # starts Node.js server process if src/server/routes/ exists
                                          # runs adb reverse for all ports
capsule dev --tunnel                      # HTTPS tunnel for physical devices / corporate WiFi
capsule dev --tunnel --qr                 # same + display QR code for instant device pairing
capsule dev --qr                          # LAN mode + QR code (no tunnel)
capsule dev --port 3000                   # custom Vite port (default: 5173)

# ── Build ─────────────────────────────────────────────────────────────────────
capsule build android                     # debug build
                                          # runs Vite/ng build (client bundle)
                                          # runs esbuild (server bundle, if src/server/routes/ exists)
capsule build android --release           # signed release APK
capsule build android --release --format aab  # signed AAB (required for Play Store)
capsule build android --release --format apk  # signed APK (for direct/enterprise install)
capsule build ios                         # debug build (Phase 4+, requires macOS)
capsule build ios --release               # signed release IPA (Phase 4+)

# ── Run & test ────────────────────────────────────────────────────────────────
capsule run android                       # deploy to running emulator or connected device
capsule run android --device <id>         # target specific device (from adb devices)
capsule run ios                           # deploy to iOS simulator or device (Phase 4+)

# ── Signing & publishing ──────────────────────────────────────────────────────
capsule sign android                      # configure Android keystore credentials (Phase 8+; Fastlane automation in Phase 9 DX)
capsule sign ios                          # configure iOS certificates via Fastlane Match (Phase 8+; Fastlane automation in Phase 9 DX)

capsule publish android                          # upload to defaultTrack (Phase 8)
capsule publish ios                              # upload to TestFlight (Phase 8)

# ── Version management ────────────────────────────────────────────────────────
capsule version                           # show current versionName and buildNumber
capsule version bump patch                # 1.4.2 → 1.4.3  (also increments buildNumber)
capsule version bump minor                # 1.4.2 → 1.5.0
capsule version bump major                # 1.4.2 → 2.0.0
capsule version set 2.0.0                 # set explicit version (also increments buildNumber)

# ── OTA updates (CodeSync) ────────────────────────────────────────────────────
capsule codesync publish                         # push new web bundle to production channel (Phase 2+)
capsule codesync releases                        # list all releases on current channel
capsule codesync rollback                        # revert to previous bundle on current channel
capsule codesync pause                           # emergency stop — halt current rollout
capsule codesync rollout <percent>               # adjust gradual rollout percentage (0–100)
capsule codesync devices                         # fleet summary (active devices, OS breakdown)
```

Key behavior: `capsule update` reads `capsule.config.ts`, bumps the shell AAR/XCFramework version in `capsule.lock`, and regenerates the thin platform wrappers. That is the entire SDK update — no code changes required.

---

### 2. Single Config (`capsule.config.ts`) ✅ Done

The complete `defineConfig` interface — every field the CLI understands:

```typescript
import { defineConfig } from '@capsule/cli'

export default defineConfig({

  // ── Identity ──────────────────────────────────────────────────────────────
  appId:   'com.yourcompany.app',   // reverse-domain — must match Play/App Store listing
  appName: 'My App',                // display name on device home screen

  // ── Version (managed by `capsule version` commands — do not hand-edit buildNumber) ──
  version: {
    name:        '1.0.0',   // human-readable semver shown in stores
    buildNumber: 1          // monotonic integer, auto-incremented by `capsule publish`
  },

  // ── Android ───────────────────────────────────────────────────────────────
  android: {
    minSdk:     26,    // Android 8.0 — minimum supported Android version
    targetSdk:  35,    // Android 15 — primary target (must match store requirements)
    compileSdk: 35,    // SDK used to compile (usually == targetSdk)

    permissions: [     // short names — CLI expands to android.permission.*
      'CAMERA',
      'POST_NOTIFICATIONS'
    ],

    signing: {         // ── all values from env vars, never hardcoded ──
      storeFile:     process.env.CAPSULE_KEYSTORE_PATH,  // path to .jks file
      storePassword: process.env.CAPSULE_KEYSTORE_PASS,
      keyAlias:      process.env.CAPSULE_KEY_ALIAS,
      keyPassword:   process.env.CAPSULE_KEY_PASS
    },

    publish: {         // ── Play Store automation (Phase 8) ──
      serviceAccountKey:     process.env.PLAY_STORE_JSON_KEY,
      serviceAccountKeyData: process.env.PLAY_STORE_JSON_KEY_DATA,
      defaultTrack: 'internal',
      packageName:  'com.yourcompany.app'
    }
  },

  // ── iOS (Phase 4+) ────────────────────────────────────────────────────────
  ios: {
    /** @experimental Available in Phase 4 (iOS support) */
    deployment: '16.0',
    bundleId:   'com.yourcompany.app',
  },

  // ── Community integrations ────────────────────────────────────────────────
  plugins: [
    '@capsule-community/google-maps',
    '@capsule-community/stripe',
    './capsule-plugins/my-integration',
    {
      path:  './capsule-plugins/vendor-sdk',
      trust: 'unverified'
    }
  ],

  // ── CodeSync OTA updates (Phase 2+) ──────────────────────────────────────
  codeSync: {
    enabled:          true,
    url:              process.env.CODESYNC_URL,
    apiKey:           process.env.CODESYNC_API_KEY,
    channel:          process.env.CHANNEL || 'production',
    strategy:         'background',
    checkOnForeground: true,
    mandatory:         false
  },

  // ── Web layer ─────────────────────────────────────────────────────────────
  web: {
    mobileReset: true,   // inject ~150-byte mobile CSS reset into built index.html
  },

  // ── Server (Phase 2+) — optional, activated by src/server/routes/ presence ──
  server: {
    timeout: 3000,   // ms before splash error screen (default: 3000)
    // No port config — port is derived from appId hash, invisible to developer
  }
})
```

The CLI reads this and generates `build.gradle`, `AndroidManifest.xml`, and `Info.plist`. Developers never touch those files directly.

---

### 3. The Native Capsule (the key investment)

**Android** — A Kotlin library (AAR) published to Maven:
- `CapsuleRuntime` coordinator owns: CapsuleServer, QuickJSEngine, SplashController, bridge (Phase 2+)
- `CapsuleActivity` is a thin shell that delegates entirely to `CapsuleRuntime`
- JS bridge registration via `JavascriptInterface`
- Handles deep links, back button, keyboard, safe area insets
- Dev mode: loads from `http://10.0.2.2:5173` (ADB port forward) — Vite client + Node.js server
- Prod mode: loads from `http://127.0.0.1:{port}/` (CivetWeb embedded server) (Phase 2+)

**iOS** — A Swift package (XCFramework) (Phase 4+):
- Same `CapsuleRuntime` interface, different implementations
- The same CivetWeb server, compiled through SwiftPM instead of the NDK
- QuickJS compiled for iOS (same C source)
- WKWebView instead of Android WebView
- Bridge via `WKScriptMessageHandler`

**Critical**: These are compiled binaries shipped by the Capsule team. Version `2.0.0` of the capsule = Android targetSdk 35. Version `2.1.0` = targetSdk 36. Developers just bump the version number.

**Shell dispatch is registry-based, not hardwired.** The bridge dispatcher inside the binary routes method calls through a mutable override map before falling back to built-in handlers. This is what enables the `capsule override` command — developer-written fixes register into this map at app startup via the generated wrapper, without recompiling the shell. The registry pattern is a first-class design requirement of the shell's internal architecture, not an afterthought.

---

### 4. The Bridge API (Web-First Philosophy)

All platform capabilities live in `@capsule/core`. No separate plugin installs for hardware or OS APIs.

```typescript
// Everything is imported from @capsule/core — no separate packages to install
import { camera, geolocation, push, haptics, bluetooth, nfc, biometrics } from '@capsule/core'

// Use directly — tree-shaking removes anything you don't import
const photo    = await camera.capture({ quality: 0.9, facing: 'back' })
const position = await geolocation.getCurrentPosition()
await push.requestPermission()
await haptics.impact('medium')

// Standard Web APIs still work as-is — no bridge needed
navigator.geolocation.getCurrentPosition(...)   // web standard, also works
navigator.mediaDevices.getUserMedia({ video: true })
```

Unused capabilities (`bluetooth`, `nfc`, etc.) are tree-shaken from the release build by R8 (Android) and the iOS linker. Importing `camera` does not include `nfc` in your binary.

Bridge protocol is **JSON-RPC 2.0** over the native bridge (see `known-issues.md` Issue 2 for full spec):
```
WebView → Native:  { jsonrpc: '2.0', id: '<uuid>', method: 'camera.capture', params: { quality: 0.8 } }
Native → WebView:  { jsonrpc: '2.0', id: '<uuid>', result: { path: '/tmp/img.jpg' } }
Native → WebView:  { jsonrpc: '2.0', method: 'push.messageReceived', params: { ... } }  // event (no id)
```

**Bridge = events only.** The Bridge (JavascriptInterface) handles all native push, events, and real-time updates. HTTP (the embedded CivetWeb server) handles all request/response data flows. These two channels never mix.

**Four bridge implementations** (same `@capsule/core` API in all contexts):
- `CapsuleBridge` — WebView + native shell (production) ✅
- `WebBridge` — browser dev fallback (all 6 APIs work in browser) ✅
- `FakeBridge` — unit tests ✅
- `QuickJSBridge` — server route handlers, Phase 2

TypeScript types are auto-generated from a bridge manifest. No stringly-typed calls. Errors are typed via a Capsule error code registry (1xxx–5xxx).

---

### 5. Hot Reload Architecture

```
capsule dev android

Process 1: Vite/ng dev server (port 5173)
  → hot reload for client code
  → adb reverse tcp:5173 tcp:5173

Process 2: Node.js server process (port 3001, if src/server/routes/ exists)
  → runs the same TypeScript route handlers
  → watches src/server/routes/ for changes
  → adb reverse tcp:3001 tcp:3001

Developer runs one command. Two processes are invisible.

Physical device:
  → Same WiFi: load from machine's LAN IP
  → USB: ADB reverse port forward
  → Corporate WiFi / different network: capsule dev --tunnel
```

**Hot reload scope**:
- JS / CSS / HTML / asset changes → instant HMR via Vite (<50ms)
- Server route changes → Node.js process restarts (fast, watched by dev command)
- Source plugin `.kt` / `.swift` changes → **full native rebuild required** (`capsule build android`). The CLI detects `.kt/.swift` changes during `capsule dev` and prints a warning.

---

### 6. File-Based Server Routing (Phase 2+)

The server is **optional**. It is activated by the presence of `src/server/routes/`. If this directory does not exist, the embedded server serves static assets only and QuickJS never starts.

```
src/
  server/
    routes/
      users.ts          → GET /api/users, POST /api/users
      users/
        [id].ts         → GET /api/users/:id
```

Each file exports `GET`, `POST`, `PUT`, `DELETE` functions. The CLI scans this directory at build time (esbuild bundles it into `assets/server/bundle.js`). Adding a file creates a route — no registration, no config.

Route handlers use the same `@capsule/core` package as client code. `QuickJSBridge` (Phase 2) is the bridge implementation that makes all 6 native APIs available from within server handlers.

**HTTP = data, Bridge = events** — route handlers return data/JSON/HTML. They never push events; events always come through the Bridge.

---

### 7. Two Bundles, One Atomic Deploy (Phase 2+)

```
capsule build android
  → Vite/ng build  →  assets/www/          (client bundle)
  → esbuild        →  assets/server/        (server bundle.js, if src/server/routes/ exists)
```

Both bundles always build and deploy together. Developer sees one version number and one deploy. `codeSync` deploys atomically — never client without server or vice versa.

**Self-healing rollback**: If the app crashes 3 times in 60 seconds after a deploy, the runtime automatically rolls back to the previous bundle. Silent recovery — developer sees a version number if they check, not a crash.

---

### 8. Core SDK vs. Community Integrations

`@capsule/core` is a **monolithic SDK** — every platform API ships together and is versioned as one unit.

```
@capsule/core   # camera, GPS, push, NFC, Bluetooth, haptics, biometrics,
                # filesystem, microphone, accelerometer, barcode, connectivity,
                # clipboard, share sheet, battery, device info, CodeSync — all built-in
```

**No version matrix. No plugin compatibility issues. One version manages everything.**

The rule for what goes in core:
> **If it is a platform OS API that ships with Android/iOS — it is in `@capsule/core`.**

**Community integrations** are separate packages for capabilities that require a third-party SDK:

```
@capsule-community/google-maps   # requires Google Maps SDK (license + ~15 MB)
@capsule-community/stripe        # requires Stripe iOS/Android SDK
@capsule-community/braintree     # requires Braintree SDK
@capsule-community/facebook-auth # requires Facebook SDK
```

**Tree-shaking**: R8 (Android) and the iOS linker strip every core capability that is never imported.

---

## Project Folder Structure (developer side)

```
my-app/
  src/                       # pure web code, any framework
    index.html               # standard HTML5, no custom tags
    main.ts
    App.tsx / App.vue / App.svelte
  src/server/                # optional — activates embedded runtime (Phase 2+)
    routes/
      users.ts               # exports GET, POST, PUT, DELETE
      users/
        [id].ts              # dynamic route
  public/                    # static assets
  capsule-plugins/           # optional: source plugins (Kotlin/Swift/C/Lua)
    my-scanner/
      capsule-plugin.json
      android/MyScanner.kt
      ios/MyScanner.swift
      web/index.ts
  capsule.config.ts          # the ONLY native configuration
  capsule.lock               # ← COMMIT THIS: pins resolved shell + plugin versions
  package.json
  vite.config.ts

  # Generated/managed by CLI — gitignored, do not edit
  .capsule/
    android/                 # thin wrapper (generated from config + capsule.lock)
    ios/                     # thin wrapper (generated from config + capsule.lock)
```

---

## Build Pipeline

```
capsule build android --release

1. Vite/ng build → dist/                               (client bundle, ~1-3s)
2. esbuild → server/bundle.js  (if src/server/routes/ exists)
3. Copy dist/ → .capsule/android/assets/www/
4. Copy server/bundle.js → .capsule/android/assets/server/  (if applicable)
5. ./gradlew bundleRelease               (AAB for Play Store)
   ./gradlew assembleRelease             (APK for direct install)
6. Sign with keystore
7. Output: .capsule/android/app-release.aab  (or .apk)
```

Gradle build cache means after the first build, incremental rebuilds only recompile changed Java/Kotlin. Since the capsule shell changes rarely (only on `capsule update`), most builds skip native compilation entirely.

---

## Phased Roadmap

> **Canonical phase status lives in [`../project/roadmap.md`](../project/roadmap.md)** (re-sequenced
> 2026-06-15, capability-first). This table mirrors it — if they diverge, the roadmap wins; update there.

| Phase | Deliverable | Goal |
|-------|-------------|------|
| **1 — Foundation** ✅ | CLI + Android capsule + Vite integration + hot reload + 6 native APIs + WebBridge | Prove the concept works end-to-end on a real device |
| **2 — Embedded Runtime** ✅ | Embedded HTTP server (NanoHTTPD, replaced by CivetWeb 2026-10) + QuickJS + CapsuleRuntime + file-based routes + atomic CodeSync | On-device server-side route handlers; production HTTP serving |
| **3 — Native APIs Expansion** | Camera, filesystem, push (FCM/APNs), network, biometrics, SQLite `db`, background jobs, … | Complete OS API surface |
| **4 — iOS** | CivetWeb (shared with Android) + QuickJS iOS + WKWebView — same config, same TS code | Dual-platform, zero developer-facing changes |
| **5 — Capsule UI** | `capsule add ui` registry + shared iOS/Material Tailwind preset — native-*look* layer (no native APIs); after iOS so presets target a real WKWebView shell | Native look-and-feel on both platforms |
| **6 — Server Code Push / OTA Cloud** | OTA network delivery + portal + canary/auto-rollback + multi-tenant + billing (+ AI/agents) | The funding engine |
| **7 — Migration On-Ramp** | `capsule migrate ionic` + `@capsule/compat-capacitor` + plugin importer | Acquisition funnel |
| **8 — Ecosystem** | GitHub org, publishing pipeline, CI/CD, npm, Docker, shell + template registry, docs site | Open source growth |
| **9 — DX** | VS Code extension, error overlays, device inspector, Fastlane signing | Developer delight |

> See `../contributing/codesync-internals.md` for the OTA system spec, `../contributing/docker.md` for Docker strategy, `lockfile.md` for the lock file spec, and `../project/server-design/overview.md` for the self-hosted portal.

---

## Technology Choices

| Concern | Choice | Reason |
|---------|--------|--------|
| CLI runtime | Node.js + TypeScript | Ecosystem, easy to distribute via npm |
| Web bundler | Vite | Fastest HMR, works with any framework |
| Server bundle | esbuild | Fast, tree-shakes TypeScript for QuickJS target |
| Android capsule | Kotlin | Modern, concise, Google-preferred |
| iOS capsule | Swift | Modern, Apple-preferred |
| Embedded HTTP server (both platforms) | CivetWeb (C, vendored) | One server for Android + iOS; ready when `start()` returns; loopback-only — adr-004 amendment |
| On-device JS runtime | QuickJS | ES2020, ~700KB, embeds cleanly via JNI |
| Bridge protocol | JSON-RPC 2.0 | Typed, standard, supports events + error registry |
| Plugin distribution | npm + Maven/SPM | Unified install experience |
| Lock file format | YAML | Human-readable, diff-friendly |
| Native version format | npm semver (`^1.0.0`, `>=2.0.0`) | Familiar, tooling exists |

---

## Critical Differentiators vs Capacitor

Capacitor already solved Cordova's worst problems. Capsule goes further:

1. **Capsule as true binary dep** — Capacitor still has `android/` and `ios/` dirs with editable source. Capsule generates minimal wrappers only.
2. **Monolithic core SDK** — All platform OS APIs ship in `@capsule/core`. No plugin compatibility matrix.
3. **Embedded HTTP server** — Production assets served from `http://127.0.0.1:{port}/`. No `file://` limitations. Service workers work. CORS is clean.
4. **On-device TypeScript server** — Route handlers written in TypeScript, same language as the client, same `@capsule/core` package. Runs on QuickJS on-device, Node.js in dev. Capacitor has no equivalent.
5. **Config-driven** — One `capsule.config.ts`, CLI generates all native manifests.
6. **Built-in CodeSync** — OTA updates are part of `@capsule/core`, opt-in per app. Atomic deploy with self-healing rollback.
7. **Surgical override** — Individual core capability methods can be patched without forking or recompiling the shell.

---

## The Single Most Important Architectural Decision

**Keep the native capsule as a compiled binary dependency from day one.**

This is the architectural bet everything else rests on. If developers are allowed to customize native capsule code freely, Capsule becomes Cordova. If the boundary holds, SDK updates remain a one-liner forever — and that is the entire value proposition.
