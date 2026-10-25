---
title: "CivetWeb in Capsule"
audience: contributor
status: current
code:
  - packages/native/civetweb/**
  - packages/capsule-android/capsule/src/main/cpp/capsule_server_jni.c
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/CivetwebServer.kt
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/RequestRouter.kt
  - packages/capsule-ios/Sources/dev/capsule/runtime/CivetwebServer.swift
  - packages/capsule-ios/Sources/dev/capsule/runtime/RequestRouter.swift
  - Package.swift
tests:
  - packages/capsule-android/capsule/src/androidTest/kotlin/dev/capsule/runtime/CivetwebServerTest.kt
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/runtime/RequestRouterTest.kt
  - packages/capsule-android/capsule/src/test/kotlin/dev/capsule/runtime/ParseHeadersTest.kt
  - packages/capsule-ios/Tests/CapsuleTests/runtime/CivetwebServerTests.swift
  - packages/capsule-ios/Tests/CapsuleTests/runtime/RequestRouterTests.swift
---
# CivetWeb in Capsule — the embedded web server

> Coming from web dev, you know HTTP servers as a *process you deploy* (Kestrel, Express, nginx).
> Capsule runs a tiny HTTP server **inside the mobile app**, bound to localhost, serving the app's own
> bundle to its own WebView. This primer explains why, and how Capsule uses CivetWeb specifically —
> on Android *and* iOS.

## Why a server inside the app at all?

The app's UI is a web app (HTML/JS/CSS) rendered in a **WebView** (an embedded Chromium on Android,
WKWebView on iOS). A WebView can load content two ways:

- `file://` — works, but browsers treat `file://` as a hostile origin: no proper CORS, flaky
  `fetch`, service-worker and module quirks, inconsistent relative-path resolution.
- `http://localhost/…` — a **real web origin**, so everything behaves like production: `fetch`,
  history API, modules, caching all work normally.

So Capsule stands up a loopback HTTP server at `http://127.0.0.1:{port}/` and points the WebView at it.
The server serves the static front-end **and** exposes an `/api/*` surface that runs the app's
server-side JavaScript in QuickJS. It's the same "web app + API" shape you know — just both halves live
on-device, on localhost. Why a real server rather than a custom URL scheme:
[adr-004](../../decisions/0004-web-serving-transport.md).

## What is CivetWeb?

**[CivetWeb](https://github.com/civetweb/civetweb)** is a small, embeddable HTTP server written in C
(MIT). You start it with a list of options and give it callbacks; it owns the listening socket and a
pool of worker threads. Because it is plain C, **the same sources compile into both shells** —
Android through the NDK, iOS through SwiftPM. One server, identical behaviour on both platforms.

The sources are vendored once, at `packages/native/civetweb/` (pinned release tag in `VERSION`,
build flags explained in its `README.md`). Capsule compiles it with `NO_FILES`: CivetWeb never
serves files itself. Every request goes to Capsule's own code.

> Replaced NanoHTTPD (Android) on 2026-10-24 — see the
> [adr-004 amendment](../../decisions/0004-web-serving-transport.md#amendment-2026-10-24-civetweb-on-both-platforms)
> for why.

## How Capsule wires it

Three layers, the same on both platforms:

```
socket ── CivetWeb (C) ── begin_request callback ── CivetwebServer ── RequestRouter ── /api/* → QuickJS
                                                    (Kotlin / Swift)   (pure logic)  └ else  → www/ assets
```

- **`RequestRouter`** decides what each request gets back. It is pure logic — no HTTP library, no
  Android/iOS types — so it is unit-tested on its own.
  - **Static branch:** any path maps to a file under the app's **`www/`** (your built front-end —
    what `capsule build` produces). `/` → `index.html`. A missing file is a `404` with the body
    `Not found: <path>`. Paths with `..` segments are refused. Files under `assets/server/` are never
    served (that's server-side code, not public).
  - **API branch:** `/api/*` goes to the QuickJS route handler (your `src/server/routes/**`). No
    matching route → `404 No handler for <path>`; a throwing route → `500`, never a crashed server.
    See [quickjs.md](quickjs.md).
- **`CivetwebServer`** is the transport: it starts CivetWeb, turns each request into an `HttpRequest`,
  calls `route()`, and writes the `HttpResponse` back (adding `Cache-Control: no-cache`, because an
  OTA update swaps files behind the same URLs).
- **The glue** between C and the host language:
  - Android: [`capsule_server_jni.c`](https://github.com/alex-vinny/capsule_framework/blob/main/packages/capsule-android/capsule/src/main/cpp/capsule_server_jni.c),
    built into `libcapsule_server.so`. Each CivetWeb worker thread is attached to the JVM once (in
    `init_thread`), so a request never pays for an attach. All JNI lookups happen up front in
    `nativeStart` — a CivetWeb thread can't see app classes through `FindClass`.
  - iOS: [`CivetwebServer.swift`](https://github.com/alex-vinny/capsule_framework/blob/main/packages/capsule-ios/Sources/dev/capsule/runtime/CivetwebServer.swift)
    calls the C API directly (the `CCivetweb` target in the repo-root `Package.swift`).

Files: Android [`CivetwebServer.kt`](https://github.com/alex-vinny/capsule_framework/blob/main/packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/CivetwebServer.kt)
and [`RequestRouter.kt`](https://github.com/alex-vinny/capsule_framework/blob/main/packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/RequestRouter.kt);
iOS the same names under `packages/capsule-ios/Sources/dev/capsule/runtime/`.

## The one interesting seam: sync server ↔ async handler

CivetWeb calls `begin_request` **synchronously**, on one of its worker threads. But the QuickJS route
handler is asynchronous (a Kotlin `suspend` function; an `async` closure in Swift), and the engine runs
on its own pinned thread — see [jni-and-cpp.md](jni-and-cpp.md). The router bridges the two by
blocking the worker until the handler finishes:

```kotlin
val response = runBlocking { handler(request.method, request.path, body, request.headers) }
```

`runBlocking` waits on CivetWeb's worker thread while the handler dispatches the actual JS execution
onto the QuickJS thread. **No deadlock**, because QuickJS never runs on a server worker thread. (Swift
does the same with a semaphore around a detached `Task`; CivetWeb's threads are not part of Swift's
cooperative pool, so blocking one starves nothing.) C#/TS analogy: `.GetAwaiter().GetResult()` from a
sync entry point, where the awaited work runs on a different scheduler.

## Lifecycle — start and stop

- **`start()` returns only when the server accepts connections.** CivetWeb's `mg_start2` binds and
  listens before it returns, so a request made immediately afterwards succeeds — no probe, no retry.
  (NanoHTTPD returned *before* binding, which caused the startup race in
  [2026-10-embedded-server-startup.md](../../project/incidents/2026-10-embedded-server-startup.md).) If the port is taken,
  `start()` throws a typed "port in use" error.
- **`stop()` returns at once.** Shutting CivetWeb down waits for its worker threads, and a worker can be
  inside an `/api` route that is itself waiting on the main thread — waiting on the main thread would
  deadlock. So the shutdown runs in the background, and the next `start()` on the same port waits for it.

The owning
[CapsuleRuntime](https://github.com/alex-vinny/capsule_framework/blob/main/packages/capsule-android/capsule/src/main/kotlin/dev/capsule/runtime/CapsuleRuntime.kt)
starts the server before pointing the WebView at the port and stops it on teardown.

## Where the port comes from

Each app gets a stable, app-specific port derived from its package name / bundle id (`portForAppId`), so two Capsule
apps on one device don't collide. The server binds `127.0.0.1` only — nothing off the device can reach it.
Dev mode skips the embedded server entirely — the WebView loads the Vite dev server on your host via
`adb reverse` instead (that's why `devServerUrl != null` short-circuits the runtime in
`CapsuleActivity.loadApp()`).

## Mental summary

- Capsule = a localhost web app + API, both running on-device, so the WebView gets a real `http://` origin.
- CivetWeb = one small C server compiled into both shells; it owns sockets and threads, Capsule answers
  every request.
- `RequestRouter` routes `/api/*` → QuickJS and everything else → `www/`; it is plain, tested logic.
- The sync-server → async-handler gap is bridged by blocking the worker, safe because the engine runs on
  a separate pinned thread.

Next: [quickjs.md](quickjs.md) — what actually runs behind `/api/*`.
