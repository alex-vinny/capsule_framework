---
title: "ADR-001: Embedded runtime architecture"
audience: contributor
status: record
---
# ADR-001 — Embedded Runtime Architecture

**Status:** Decided  
**Date:** 2026-06-02

---

## Context

Capsule currently serves production web assets from `file:///android_asset/www/index.html`. This has known limitations (no service workers, CORS issues, storage sandboxing). The alternative — `WebViewAssetLoader` — closes the `file://` gap but adds nothing new.

The decision was made to go further: embed a real HTTP server (NanoHTTPD on Android, GCDWebServer on iOS) and a JS runtime (QuickJS) to enable on-device server-side rendering and API routing. This is Capsule's primary differentiator vs Ionic/Capacitor.

> **Server library superseded (2026-10-24):** both platforms now embed CivetWeb instead of NanoHTTPD / GCDWebServer — see the [adr-004 amendment](0004-web-serving-transport.md#amendment-2026-10-24-civetweb-on-both-platforms). The rest of this ADR is unchanged; NanoHTTPD mentions below are historical.

---

## Decisions

### 1. Purpose
The embedded server's primary job is **dynamic API routing and SSR**, not static asset serving. Static serving is a side effect.

### 2. Route ownership — Model C
- Capsule owns `/capsule/*` (internal bridge migration, built-in APIs)
- Developer owns `/api/*` (custom route handlers)
- Clear namespace separation, no conflicts

### 3. Server language — TypeScript + QuickJS
Developer writes TypeScript route handlers. Same language as the client. Same `@capsule/core` package works in both contexts. QuickJS (ES2020, ~700KB) evaluates the server bundle on-device. Node.js evaluates it in dev mode. No Kotlin/Swift route handler code required from developers.

### 4. Bridge stays for events — HTTP is data only
```
HTTP (NanoHTTPD/GCDWebServer)  →  request / response  →  data, mutations, SSR
Bridge (JavascriptInterface)    →  push / events        →  native APIs, real-time
```
No WebSockets, no SSE, no full web server features. Deliberately minimal.

> **Amended by [adr-004](0004-web-serving-transport.md) (2026-06-26).** HTTP fidelity is now
> *tiered*, not minimal-forever: static + request/response + **streaming** are in scope now;
> **WebSockets and SSE are deferred-by-design future features** (they need a new core route
> model), not permanently excluded. The Bridge-vs-HTTP channel split above still holds — WS/SSE
> would be *web-standard real-time inside the on-device server* (for "any web app just works"
> fidelity), distinct from the native-event Bridge.

### 5. `QuickJSBridge` implements `Bridge` interface
`@capsule/core` is universal: same package, same API, three contexts:
- `CapsuleBridge` — WebView + native shell
- `WebBridge` — browser dev
- `FakeBridge` — unit tests
- `QuickJSBridge` — server handlers (new)

Server handler code is identical to client code for all `@capsule/core` calls.

### 6. Server readiness — Splash + timeout
- Splash shows immediately on launch
- `CapsuleRuntime.start()` binds NanoHTTPD + evaluates QuickJS bundle
- On ready → navigate WebView to `http://127.0.0.1:{port}/`
- On timeout (3s default) → error screen with retry button
- On crash loop (3 failures / 60s) → auto-rollback via `codeSync`

> **Amended 2026-10-15 (bind race, [2026-10-embedded-server-startup.md](../project/incidents/2026-10-embedded-server-startup.md)).**
> Contract made explicit: **`CapsuleServer.start()` returns only when the server accepts
> connections.** NanoHTTPD 2.3.1's `start()` returns before `bind()` (verified in the bytecode),
> which let the WebView race the bind (`ERR_CONNECTION_REFUSED` on fast devices) and made the
> 3s bind timeout dead code. Enforcement = readiness probe + bind retry in `NanoHttpdServer`
> (SR-1..SR-5 in the linked doc).
> **Enforcement superseded 2026-10-24** (the contract stands): CivetWeb's `mg_start2` returns only after the bind, so the probe and
> retry were removed — see the Resolution section of the linked doc.

### 7. Port — deterministic hash from `appId`
Port derived from `appId` hash, range 49152–65535. Invisible to developer. No configuration.
*Amended 2026-10-24:* computed at runtime from the app's own package name / bundle identifier
(`CapsuleShellConfig.appId` defaults to it), not baked in by `capsule sync` — the generated
`MainActivity` never passed it, so every app used the shared default and the second Capsule app
on a device found its port taken.

### 8. Dev mode — Node.js runs server bundle
`capsule dev` starts two processes:
1. Vite/ng dev server (client code, hot reload)
2. Node.js process (server bundle, same TypeScript, watches `src/server/routes/`)

`adb reverse` forwards both ports to device. Browser and device both work. Developer uses one `capsule dev android` command — two processes are invisible.

### 9. File-based routing
```
src/
  server/
    routes/
      users.ts          → GET /api/users, POST /api/users
      users/
        [id].ts         → GET /api/users/:id
```
Exports `GET`, `POST`, `PUT`, `DELETE` functions. CLI scans at build time. Adding a file creates a route. No registration, no config.

### 10. Server is optional
`src/server/routes/` presence activates full stack. Absent → NanoHTTPD serves static assets only, QuickJS never starts. Developer opts in by creating a file.

### 11. Two bundles, one atomic deploy
```
capsule build android
  → vite/ng build  →  assets/www/          (client)
  → esbuild        →  assets/server/        (server bundle.js)
```
Always both, always together. Developer sees one build, one deploy, one version. `codeSync` deploys atomically. No independent channel configuration.

### 12. Developer visibility — zero
The embedded server is invisible infrastructure. Developer writes a web app. Port, bundles, QuickJS, NanoHTTPD — none of this appears in docs, CLI output, or `capsule.config.ts`. Crash + rollback is silent recovery.

### 13. `CapsuleRuntime` coordinator
```kotlin
class CapsuleRuntime(
    val bridge: CapsuleBridge,
    val server: CapsuleServer,       // interface → NanoHTTPD (Android) / GCDWebServer (iOS)
    val jsRuntime: QuickJSEngine,    // interface → QuickJS JNI (both platforms)
    val splash: SplashController,    // interface → WebView splash impl
    val codeSync: CodeSyncManager,   // interface → rollback on crash loop
)
```
`CapsuleActivity` becomes a thin shell. All lifecycle, readiness, and crash handling owned by `CapsuleRuntime`.

### 14. Interfaces + fakes — mandatory pattern
Every new component ships with an interface and a fake on the same day:
- `CapsuleServer` + `FakeCapsuleServer` (neverStarts, startsAfter, crashesAfter)
- `QuickJSEngine` + `FakeQuickJSEngine` (evaluationFails, slowStart, callReturns)
- `SplashController` + `FakeSplashController`

All `CapsuleRuntime` behavior covered by pure JVM unit tests, no device needed.

---

## Implementation Plan

### Android (Phase 2)

**Step 1 — Interfaces + fakes**
`CapsuleServer`, `QuickJSEngine`, `SplashController` interfaces. All three fakes. `CapsuleRuntime` wired with fakes. Full unit test suite: server not ready, timeout, crash loop, successful start.

**Step 2 — NanoHTTPD for static assets**
`NanoHttpdServer implements CapsuleServer`. Replaces `file:///android_asset/www/index.html` with `http://127.0.0.1:{port}/`. No QuickJS yet. Verifiable immediately on device.

**Step 3 — Splash + readiness**
`WebViewSplashController`. `CapsuleRuntime.start()` shows splash, waits for NanoHTTPD bind, navigates. Timeout + error screen. Tested with `FakeCapsuleServer.neverStarts()`.

**Step 4 — QuickJS JNI embedding**
QuickJS C library in AAR via JNI. `QuickJSEngine.evaluate(bundle)` and `call(fn, args)`. Prove JS evaluation works. No routes yet.

**Step 5 — `QuickJSBridge`**
`Bridge` interface implementation backed by JNI → Kotlin providers. `@capsule/core` runs inside QuickJS. Every existing bridge method tested from QuickJS context.

**Step 6 — Route handling + CLI build step**
NanoHTTPD `/api/*` → `QuickJSEngine.call("handleRequest", ...)` → response. CLI `build` adds esbuild server bundle step. CLI `dev` adds Node.js server process + second `adb reverse` port.

**Step 7 — `codeSync` crash loop + rollback**
Atomic bundle zip: `www/ + server/bundle.js`. 3 crashes in 60s → rollback to previous zip. Tested with `FakeCapsuleServer.crashesAfterRequests(1)`.

### iOS (Phase 4)

`CapsuleRuntime` untouched. Swap:
- `NanoHttpdServer` → `GCDWebServerImpl implements CapsuleServer`
- `QuickJSEngine` JNI → QuickJS compiled for iOS (same C source)
- `SplashController` → `WKWebViewSplashController`

Zero developer-facing changes. Same `capsule.config.ts`, same TypeScript route handlers, same CLI commands.

---

## What stays unchanged

- Existing JSON-RPC bridge and all 6 native API handlers
- `@capsule/core` public API — modules, types, exports
- `capsule.config.ts` schema (minor additions only: `server.timeout`)
- All existing templates and examples
- Dev flow: `capsule dev android` still starts everything
