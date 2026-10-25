---
title: "Build history"
audience: contributor
status: record
---
# Capsule Framework — Build History (append-only log)

> Chronological record of build sessions. **This is history, not current state.** For
> "where are we now / how to resume" see `STATE.md`; for authoritative status see
> `Build/000-Roadmap.md`. Resume snippets and tool paths in older entries are historical
> (some are stale) — resume via `STATE.md` / the `../scripts/` repo, not by copying them.
> Append new sessions at the end; don't rewrite past entries.

---

## Environment

| Tool            | Version                             | Notes                                           |
| --------------- | ----------------------------------- | ----------------------------------------------- |
| OS              | Windows 11 Pro                      | Primary machine                                 |
| Shell           | PowerShell                          | All commands run here                           |
| WSL2            | Ubuntu 22.04                        | Available, not used yet                         |
| Node.js         | v22.22.3                            | Managed via nvm-windows                         |
| pnpm            | 9.15.9                              | Global install via npm                          |
| git             | 2.33.1 (Windows)                    |                                                 |
| Java            | 17.0.19 (Temurin)                   | Managed via jabba                               |
| Gradle          | 8.0.2 (system)                      | At <gradle-home>\                  |
| Android SDK     | platforms 34+35, build-tools 35.0.0 | At <android-sdk>\                        |
| adb             | 1.0.41                              | <android-sdk>\platform-tools\            |
| sdkmanager      | 20.0 (new cmdline-tools)            | <android-sdk>\cmdline-tools\latest\bin\  |
| Physical device | Samsung (USB)                       | USB debugging enabled, authorized               |

### PowerShell Profile fixes (persisted to $PROFILE)

```powershell
# Java — jabba symlink overridden by system PATH
$env:JAVA_HOME = "<jdk-17>"
$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH

# Android cmdline-tools — new sdkmanager before old tools\bin
$env:PATH = "<android-sdk>\cmdline-tools\latest\bin;" + $env:PATH
```

### Environment variable (set per session, not persisted yet)

```powershell
$env:CAPSULE_SHELL_OVERRIDE_PATH = "<repo>\packages\capsule-android\capsule\build\outputs\aar\capsule-debug.aar"
```

> **TODO**: Add `CAPSULE_SHELL_OVERRIDE_PATH` to `$PROFILE` so it persists across sessions.

---

## Monorepo location

```
<workspace>\
  capsule\          ← monorepo (git repo, the framework)
  docs\             ← spec docs (Architecture/, Build/, Server/) — NOT inside the repo
```

---

## What was built

### Phase 1 — Foundation ✅ Complete

- pnpm workspace + Turbo pipeline + tsconfig.base.json + ESLint + Prettier
- `@capsule/core`: JSON-RPC 2.0 bridge, geolocation, device, haptics, clipboard, storage, alerts APIs — Bridge interface + module classes with injectable bridge + FakeBridge test double — 36 unit tests passing
- `@capsule/cli`: all Phase 1 commands (`init`, `add`, `sync`, `dev`, `build`, `run`, `doctor`) + `capsule sync --frozen-lockfile` (SHA-256 lock file)
- `capsule-android` Kotlin AAR — layered architecture, @Serializable models, BridgeError sealed class
- Handlers (all with pure JVM unit tests + fakes): geolocation, device.getInfo, haptics.vibrate, clipboard.read/write, storage.get/set/remove/clear/keys, alerts.show
- `CapsuleBridge` takes `List<BridgeHandler>` — stable constructor, add handlers via `buildHandlers()` in Activity
- `gradlew.bat` full-path fix in CLI — `capsule build android` works correctly on Windows
- 7 templates at `/templates/` (vanilla-js, vanilla-ts, react-ts, vue-ts, svelte-ts, angular-ts, jquery-bootstrap)
- `capsule init` with giget integration — auto-detects local templates in dev vs GitHub in production
- 13 examples: react-ts, react-ts-native, react-ts-tailwind, rollup-solid, rspack-lit, webpack-preact, + 7 `*-from-template` examples — all tested on real Samsung device
- Module override pattern proven: `ClipboardModule` subclass with injected bridge

**Tested on real Samsung device:** GPS, device info, haptics, clipboard, storage, alerts all confirmed working across all 13 example apps.

---

### Phase 2 — Embedded Runtime (Android) ✅ Complete

**Architecture decision:** Replace `file://` + `WebViewAssetLoader` with embedded NanoHTTPD (Android) + QuickJS runtime.
Full ADR at `docs/Architecture/adr-001-embedded-runtime.md`.

#### Step 1 — Interfaces + fakes + CapsuleRuntime ✅

Files in `capsule/src/main/kotlin/dev/capsule/runtime/`:

| File                  | Role                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `CapsuleServer.kt`    | interface: `port`, `start()`, `stop()`                                    |
| `QuickJSEngine.kt`    | interface: `evaluate(bundle)`, `call(fn, args)`                           |
| `SplashController.kt` | interface: `show()`, `hide()`                                             |
| `AppNavigator.kt`     | interface: `navigateTo(url)`                                              |
| `CapsuleRuntime.kt`   | coordinator: splash → server.start() → navigate → splash.hide() + timeout |
| `PortUtils.kt`        | `portForAppId(appId)` — deterministic hash, range 49152–65535             |

Fakes in `src/test/kotlin/dev/capsule/fakes/`:
`FakeCapsuleServer` (behaviors: normal, NeverStarts, StartsAfter, CrashesAfter), `FakeQuickJSEngine`, `FakeSplashController`, `FakeAppNavigator`

13 unit tests in `CapsuleRuntimeTest`, 2 in `PortUtilsTest` — all pure JVM, no Android runtime.

#### Step 2 — NanoHTTPD static asset server ✅

`NanoHttpdServer.kt` — serves `assets/www/` at `http://127.0.0.1:{port}/`. MIME type via NanoHTTPD helper. 404 on missing paths.

#### Step 3 — Splash + readiness + error screen ✅

`WebViewSplashController.kt` — white overlay View on FrameLayout, show/hide.
`WebViewNavigator.kt` — thin wrapper around `WebView.loadUrl()`.
`NoOpQuickJSEngine.kt` — placeholder superseded by Step 4.

`CapsuleActivity` fully wired:

- Dev mode: loads `capsuleConfig.devServerUrl` directly
- Prod mode: `CapsuleRuntime(NanoHttpdServer, QuickJSEngineImpl, WebViewSplashController, WebViewNavigator)`
- Timeout path: `showTimeoutError()` — white overlay with "App failed to start" + Retry button

#### Step 4 — QuickJS JNI embedding ✅

Files in `capsule/src/main/cpp/`:

| File             | Role                                                           |
| ---------------- | -------------------------------------------------------------- |
| `CMakeLists.txt` | Builds `quickjs` static lib + `capsule_quickjs_jni` shared lib |
| `quickjs_jni.c`  | JNI wrapper: `nativeCreate/Destroy/Evaluate/Call`              |
| `quickjs/`       | 18 vendored quickjs-ng C/H source files                        |

Kotlin files in `runtime/`:

| File                   | Role                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `QuickJSException.kt`  | Sealed class: `EvaluateError`, `CallError`                                                                                      |
| `QuickJSEngineImpl.kt` | JNI-backed engine — single-thread dispatcher (4 MB stack), runtime created on dispatcher thread to fix QuickJS stack-base check |

Key fix: `nativeCreate()` must run on the dispatcher thread (`runBlocking(dispatcher) { nativeCreate() }`) so QuickJS records the correct stack base for its overflow guard.

Instrumented tests: 4 passing in `src/androidTest/…/QuickJSEngineImplTest.kt`

- `evaluateAndCall_add` — `add(1,2)` → `"3"` ✓
- `call_returnsJsonObject` — `wrap(42)` → `{"value":42}` ✓
- `evaluate_syntaxError_throwsEvaluateError` ✓
- `call_unknownFunction_throwsCallError` ✓

#### Step 5 — QuickJSBridge: `@capsule/core` routes in QuickJS ✅

**What was built:**

| File | Role |
| ---- | ---- |
| `packages/core/src/router.ts` | `addRoute(method, handler)` + `dispatch(requestJson)` — returns `object \| null` (not string) |
| `packages/core/tsup.config.ts` | Added `src/router.ts` entry → produces `dist/router.{js,mjs,d.ts}` |
| `packages/core/package.json` | Added `"./routes"` export pointing to `dist/router.*` |
| `packages/cli/src/commands/build.ts` | `bundleRoutes()` — esbuild IIFE bundle (`globalName: 'capsuleRouter'`) + appends `var dispatch = capsuleRouter.dispatch; var addRoute = capsuleRouter.addRoute;` to routes.js |
| `capsule-android/.../runtime/QuickJSBridge.kt` | Loads `assets/www/routes.js` into engine, routes JSON-RPC via `engine.call("dispatch", "[quoted]")` |
| `capsule-android/.../CapsuleBridge.kt` | Tries QuickJS first (`quickJsBridge?.handleRequest(raw)`), falls through to Kotlin on null |
| `capsule-android/.../CapsuleActivity.kt` | Creates `QuickJSEngineImpl` + `QuickJSBridge`, wires both into `CapsuleRuntime` |

**Deleted:** `handlers/quickjs/QuickJSPingHandler.kt` (superseded by real bridge)

**Instrumented tests:** 4 passing in `QuickJSBridgeTest.kt`
- `handleRequest_unregisteredMethod_returnsNull` ✓
- `handleRequest_registeredMethod_returnsJsonRpcResponse` ✓
- `handleRequest_handlerThrows_returnsErrorResponse` ✓
- `handleRequest_jsHandlerTakesPriorityOverKotlin` ✓

**Critical QuickJS JNI constraints discovered (required for correctness):**

1. **`globalThis` is the only reliable persistent namespace across `evaluate()` → `call()` boundaries.** Top-level `var` bindings and function-object properties (e.g. `fn._routes = {}`) are NOT reliably visible inside functions called via `engine.call()`. The C helper uses `globalThis[fn]` — use `globalThis.__capsule_routes` for shared state.

2. **JS functions called via `engine.call` must return plain objects, not JSON strings.** The C `__capsule_call` helper wraps every return value in `JSON.stringify()`. If JS `dispatch()` returns a pre-serialised string (from `JSON.stringify({...})`), the result is double-encoded: `"{\"jsonrpc\":\"2.0\",...}"`. The correct pattern is to return the object directly: `return { jsonrpc: '2.0', id, result }`.

   - `router.ts`: `dispatch()` return type is `object | null` (was `string | null`)
   - Test `routerScript`: `return { jsonrpc: "2.0", id, result }` (not `JSON.stringify(...)`)
   - Exception: production esbuild IIFE bundle is fine — all routes registered inside the IIFE before it returns, closures work correctly within a single `evaluate()` call.

#### Step 6 — File-based routing + NanoHTTPD /api/* routing ✅

**What was built:**

| File | Role |
| ---- | ---- |
| `packages/core/src/router.ts` | Added `CapsuleHttpRequest`, `CapsuleHttpResponse`, `addHttpRoute(path, method, handler)`, `handleHttpRequest(method, path, body, headers)` |
| `packages/cli/src/commands/build.ts` | `bundleRoutes()` auto-discovers `src/routes/*.ts` (JSON-RPC) + `src/server/routes/**/*.ts` (HTTP); writes to `assets/server/bundle.js` |
| `capsule-android/.../runtime/QuickJSBridge.kt` | Added `HttpRouteResponse` data class + `handleHttpRequest()` interface method |
| `capsule-android/.../runtime/QuickJSBridgeImpl.kt` | Implements `handleHttpRequest`; loads from `assets/server/bundle.js` (was `assets/www/routes.js`) |
| `capsule-android/.../runtime/NanoHttpdServer.kt` | `/api/*` requests forwarded to `apiHandler` (suspend lambda → QuickJS); `assets/www/` serves client only; `assets/server/` never exposed |
| `capsule-android/.../CapsuleActivity.kt` | Passes `quickJsBridge::handleHttpRequest` as `NanoHttpdServer.apiHandler` |

**Tests:**
- `packages/core/src/__tests__/router-http.test.ts` — 9 new TypeScript unit tests
- `capsule-android/.../androidTest/.../QuickJSBridgeHttpTest.kt` — 5 new instrumented tests

**Bundle path correction:** `assets/www/routes.js` → `assets/server/bundle.js`. Server code is never served as a static file.

**`/* ... */` in KDoc bug:** Kotlin's nested block comments mean `/api/*` inside a KDoc `/** */` block opens an unclosed nested comment. Fixed by using `//` line comments on the class instead.

**Developer usage:**
```typescript
// src/server/routes/users.ts
import type { CapsuleHttpRequest, CapsuleHttpResponse } from '@capsule/core/routes'

export function GET(req: CapsuleHttpRequest): CapsuleHttpResponse {
  return { status: 200, body: JSON.stringify({ users: [] }), mimeType: 'application/json' }
}
```
```typescript
// src/routes/device.getInfo.ts  (JSON-RPC override)
export default function handler() {
  return { platform: 'android', model: 'Custom' }
}
```

---

## Kotlin unit tests — current count

| Suite                                | Tests  |
| ------------------------------------ | ------ |
| GeolocationHandlerTest               | 5      |
| DeviceInfoHandlerTest                | varies |
| HapticsHandlerTest                   | varies |
| ClipboardHandlerTest                 | varies |
| StorageHandlerTest                   | varies |
| CapsuleWebViewClientTest             | varies |
| CapsuleRuntimeTest                   | 21     |
| CrashLoopGuardTest                   | 9      |
| FileBundleStoreTest                  | 10     |
| PortUtilsTest                        | 2      |
| QuickJSEngineImplTest (instrumented) | 4      |
| QuickJSBridgeTest (instrumented)     | 4      |
| QuickJSBridgeHttpTest (instrumented) | 5      |

**JVM unit total: 71 passing** (`gradlew :capsule:testReleaseUnitTest`, 2026-06-15).
TypeScript unit tests: **60 passing** (9 test files)

---

## Current status

### Session 2026-06-16 — Phase 3 #1: Filesystem API (Android)

**Shipped the Filesystem native API** (capsule `083b2cf`, examples `18103d8`) — the foundational
Phase-3 capability, built with the proven interface + provider + Fake pattern across all three layers:

- **`@capsule/core`** — `FilesystemModule`: `readFile / writeFile / appendFile / deleteFile / mkdir /
  rmdir / readdir / stat / getUri / downloadFile`; `FilesystemDirectory` (`data`/`cache`/`documents`),
  `FileEncoding` (`utf8`/`base64`), `FileEntry`/`FileStat`; `FilesystemMethods` shared with WebBridge.
  New error codes 5xxx: `FILE_NOT_FOUND` / `FILE_IO_ERROR` / `PATH_NOT_ALLOWED`.
- **WebBridge dev fallback** — localStorage-backed FS keyed by `(directory, path)`, base64-canonical
  storage with unicode-safe utf8⇄base64, implicit-directory `readdir`, traversal guard. Methods are
  `async` so the synchronous traversal check rejects (per the `Bridge.call` promise contract) rather
  than throwing.
- **`capsule-android`** — `FilesystemProvider` (iOS seam) + `AndroidFilesystemProvider` over
  `java.io.File`, all I/O on `Dispatchers.IO`, canonical-path traversal guard, `downloadFile` via
  `HttpURLConnection`; `filesystemHandlers(...)` wired into `CapsuleActivity`.
- **`@capsule/cli`** — `sync.ts` now auto-declares `INTERNET` (normal permission, no dialog) for
  `downloadFile`.
- **react-ts example** — new **Filesystem** playground tab (directory toggle + write/append/read/stat/
  delete + mkdir/readdir + download).

**OTA-safety constraint (a) honored concretely:** roots are `filesDir/capsule/fs/{data,documents}` and
`cacheDir/capsule/fs/cache`, deliberately *not* under `filesDir/bundles` (the OTA swap target) — an
instrumented test (`rootsLiveOutsideTheOtaBundleDir`) asserts the invariant.
**Constraint (b) native-capability version: deferred by design** — no consumer until the Phase-5 OTA
server exists; building the gate now would be speculative. Land it alongside Phase 5.

**Full test sweep — all green (2026-06-16):** TS unit **91** (`@capsule/core`; +12 filesystem module,
+9 web-bridge fs) · Kotlin JVM unit **85** (+14 `FilesystemHandlerTest`; `testReleaseUnitTest` BUILD
SUCCESSFUL) · Android instrumented **23** (+10 `AndroidFilesystemProviderTest` — real encoding
round-trips, traversal guard, directory isolation, OTA-safety) on `CapsuleTest` emulator (API 35) ·
react-ts example `tsc --noEmit` clean · release AAR rebuilt clean.

**Review + refactor (same day, capsule `f99315b`):** re-read the Filesystem implementation for smells.
Three fixed:
1. **`getUri` contract violation** — `resolve()` did `root().apply { mkdirs() }`, so the documented
   "pure, no I/O" `getUri` (and reads/`stat`) created the root dir as a side effect. Now `resolve()` is
   pure; roots are created lazily only by the write paths (`prepareParent`/`mkdir`).
2. **Repeated `try/catch → FileIoError`** across 4 provider methods → extracted a single
   `io { }` helper (runs on `Dispatchers.IO`, passes `CapsuleException` through, maps anything else to
   `FileIoError`). Also fixed a case where `decode()`'s specific error got re-wrapped/lost.
3. **Cross-file param-parsing duplication** (camera + filesystem each had private
   `string`/`bool`/`contentOrNullSafe`) → new shared `handlers/JsonParams.kt`
   (`optString`/`optInt`/`optDouble`/`optBool`); both handler sets migrated. Sets the convention for
   every future API's param parsing.
No behavior change intended — verification pending the user's full test run before commit.

**Overall health — good.** Phase 3 on track (Camera + Filesystem done, tested release + dev + browser);
pattern consistency holding (interface + provider + Fake + DTO); test pyramid healthy. No architectural
debt surfaced beyond the three smells above.

**Design note — Share / "save to user-visible location" (discussed, not built):** `share` is a *native*
OS feature everywhere (Android `ACTION_SEND` share sheet, iOS `UIActivityViewController`, Web Share API)
— Capsule just bridges it; reuses the camera `FileProvider`. It's the truly cross-platform primitive for
"give the user this file," because **iOS has no public Downloads folder** (its share sheet covers Save to
Files/Photos). A `saveToDownloads` is therefore an Android/web *specialization* (Android
`MediaStore.Downloads`, web Save-As), not a core API. `filesystem.downloadFile` is correctly *app-private*
(verified: browser stores under `__capsule_fs__:*` in localStorage; device under `filesDir`). Share stays
at roadmap Phase 3 #7 unless pulled forward.

**Next: Phase 3 #2 — App lifecycle + deep links** (fg/bg events + incoming URLs/universal links;
infrastructure that push tap-routing and OTA foreground re-checks both depend on). Share (#7) can be
pulled forward on request — it's self-contained and low-risk.

### Session 2026-06-15 — Group 2 browser-dev + Phase 2 Step 7 (CodeSync crash-loop)

**Group 2 (non-Vite transparent proxy) browser-dev — all 3 PASS** (verified with headless Chromium, not just curl):
- `webpack-preact` (proxy :5184), `rspack-lit` (:5186, Shadow DOM), `rollup-solid` (:5185, `CAPSULE_INTERNAL_PORT`→:5186). App renders, `/__capsule.js` injected, `window.fetch` patched, `/api/ping` + hello RPC resolve through the sidecar, 0 console/page errors. Results logged in `docs/TEST_PLAN.md` (Group 2 results log).
- **Real proxy bug found + fixed** in `cli/src/dev-proxy-server.ts` (`forwardInjectHtml`): the non-Vite proxy buffered HTML to inject the Capsule script assuming **uncompressed** bytes. Browsers/WebView send `Accept-Encoding: gzip`; webpack-dev-server (default `compress: true`) gzipped the HTML → proxy injected into gzip garbage, stripped `content-encoding`, forwarded compressed bytes as `text/html` → garbled page, no injection. **curl masked it** by not requesting compression. Fix: strip `accept-encoding` before forwarding so the bundler returns injectable plaintext. Would have broken *all* non-Vite examples under `capsule dev` on device, not just in-browser. CLI rebuilt.
- **Corrected Group 2 ports in TEST_PLAN.md** (were 5182/5183/5185; actual 5184/5186/5185 — same drift as Group 0). Noted the 5185/5186 overlaps (harmless — run one at a time).
- HMR-through-proxy: WebSocket upgrade forwarding works for all 3. webpack/rspack do **live-reload** (no prefresh/lit-hot boundary configured in the examples); rollup has no `rollup-plugin-livereload` (rebuild-on-save only). Marked ⚠️ in the matrix — example config, not a proxy gap.

**Phase 2 Step 7 — CodeSync crash-loop + rollback ✅ (on-device mechanism; OTA network delivery still Phase 4):**
- New runtime classes (interface-first, all pure-JVM testable): `Clock`/`SystemClock`, `CrashLog` + `PrefsCrashLog` (SharedPreferences, survives process death), `CrashLoopGuard` ("3 crashes in 60s", injectable clock+log), `BundleStore` + `FileBundleStore` (two-slot active/previous, atomic dir swap, validates `www/index.html`, `server/bundle.js` carried alongside).
- `CapsuleRuntime`: rolls back to previous known-good bundle on start() when crash-looping (+ `onRollback()` hook), records each launch attempt, `notifyAppReady()` confirms a healthy boot and clears the counter. Wired into `CapsuleActivity` prod path (`PrefsCrashLog` + `FileBundleStore(filesDir/bundles)`); `CapsuleWebViewClient.onPageFinished` → `notifyAppReady()`.
- 25 new pure-JVM tests + fakes (`FakeClock`/`FakeCrashLog`/`FakeBundleStore`): CrashLoopGuard 9 · FileBundleStore 10 · CapsuleRuntime rollback 6, incl. the spec's `FakeCapsuleServer.CrashesAfter(0)` "three crashes → fourth launch rolls back" path. **Full JVM suite 71 green**; release AAR rebuilt clean.
- Design note: a crash loop is only *confirmable on the next boot* (the crash kills the process), so rollback fires on the launch **after** the 3rd recorded crash — matching CodePush/Expo semantics.

**Senior-architect review + pre-commit verification (2026-06-15):**
- **Patterns:** Step 7 follows the existing interface + impl + fake convention (Clock/SystemClock, CrashLog/PrefsCrashLog/FakeCrashLog, BundleStore/FileBundleStore/FakeBundleStore) and CapsuleRuntime's Orchestrator + Template-Method shape (`onRollback()` added next to `onStartTimeout()`). No pre-existing clock/`currentTimeMillis` usage in main — the abstraction is introduced cleanly.
- **Refactor applied:** `FileBundleStore` now leans on Kotlin stdlib `File.copyRecursively`/`deleteRecursively` and drops redundant explicit deletes (`move()` already clears its destination), removing two hand-rolled helpers. Behavior unchanged; 71 JVM tests still green after the rerun.
- **Open accessor:** `BundleStore.activeDir()` is exercised by tests but not yet consumed by the runtime (NanoHttpdServer still serves `assets/`); it will be wired when the server serves from the active bundle dir in the Phase 4 OTA path.
- **Prettier:** changed `dev-proxy-server.ts` was already clean; formatted 2 **pre-existing** unrelated files (`init.ts`, `tailwind.ts`) so the tree is prettier-clean. Whole TS tree passes `format:check`.
- **Full test sweep — all green:** `pnpm build` (core + cli) ✅ · `@capsule/core` TS unit **60/60** ✅ · Kotlin JVM unit **71/71** ✅ (`testReleaseUnitTest --rerun-tasks`) · Android instrumented **13/13** ✅ on `CapsuleTest` emulator (`connectedDebugAndroidTest`) · release AAR rebuilt clean.
- **Pre-existing issue flagged (not mine, out of scope):** `@capsule/cli`'s `test` script is a bare `vitest run`, so it sweeps the `assets/testing/**` template *fixtures* (react/svelte/vanilla/vue app tests + `_shared` quickjs/routes) which only resolve inside a scaffolded project (project-relative imports like `../routes/hello`) and therefore fail at the CLI repo root. Recommend excluding `assets/testing/**` from the CLI vitest config (or running those only post-scaffold) in a separate change.

### Phase — Testing (2026-06-11 session)

**This session:**
- Fixed `FakeQuickJSBridge` — was missing `handleHttpRequest` (added in Step 6 interface), broke `gradlew test`. Now implemented (records calls in `httpRequests`, returns settable `httpResult`). `gradlew test` green.
- Full test pyramid verified: TS unit (60) ✅ · Kotlin JVM unit ✅ · Android instrumented (13: QuickJSEngineImpl 4 + QuickJSBridge 4 + QuickJSBridgeHttp 5) ✅ on emulator.
- Added `examples/scripts/` — `emulator.ps1 <start|stop|status>` (software GPU default to avoid Intel-UHD boot hang, detached + log-redirected, `-Fresh`/`-NoWait`/`-Headless`/`-Gpu` flags) + `env.ps1` + README.
- Group 0.1 `react-from-template` browser-dev ✅ PASS (all 8 checks). Server on devPort **5190** (sidecar 6190).
- Group 0.1 emulator-dev ✅ PASS — surfaced + fixed a real architectural gap (below).
- Fixed wrong `devPort` values in `docs/TEST_PLAN.md` + `examples/README.md` for 6 of 7 from-template examples (real ports: react 5190, vue 5175, svelte 5176, angular 5177, vanilla-js 5182, vanilla-ts 5174, jquery 5183).
- Tab-state decision: results **persist** across tab switches by design (state lifted to `App`). Removed the wrong "state resets" check. Added a **Clear** button to `react-from-template` Server tab only.

**Code fixes this session (in `capsule-android` + `cli`):**
- **Dev-mode JSON-RPC routes on-device** — `bridge.call('hello')` returned `METHOD_NOT_FOUND` under `capsule dev android`. Root cause: `@capsule/core` uses the native bridge whenever `__capsule_host` is injected (always on Android), but in dev mode `CapsuleActivity.loadApp()` returns early and never attaches QuickJS, so custom `src/routes/*.ts` had no handler. **Fix:** `CapsuleBridge.postMessage` now forwards unmatched methods, in dev mode, to the dev sidecar (`POST ${devServerUrl}/_capsule/rpc` via adb reverse) and relays the response. Built-in native APIs still resolve via Kotlin handlers first. Added `TAG`/`Log.d` diagnostics on the forward path. Verified working on emulator.
- **`dev.ts` Vite watcher** — added `server.watch.ignored: ['**/.capsule/**','**/dist/**','**/.gradle/**']` so `capsule dev` and `capsule build android` run concurrently. Previously the Vite watcher held handles in `.capsule/android/.gradle`, breaking Gradle's atomic rename on Windows ("Could not move temporary workspace to immutable location"). CLI rebuilt.

**Workflow rule settled:** always use the **release** AAR (`isMinifyEnabled=false`, no log stripping, identical behavior; app build-type decides dev/embedded, not the AAR). The recurring trap is a **stale AAR** — always `gradlew assembleRelease` after any Kotlin change before `build android`, and confirm the override line + AAR timestamp. See `env_checklist` memory.

**Emulator:** Intel UHD GPU hangs host-GPU boot (`boot_completed` never flips) → `examples/scripts/emulator.ps1` now defaults to `-gpu swiftshader_indirect`.

**Repo + templates (2026-06-12):**
- Repo layout settled: `capsule` / `examples` / `docs` / `templates` are **separate git repos** (not a monorepo); templates kept separate due to higher churn. `templates/` `git init`'d + committed. All four committed this session.
- **Template extensibility** implemented in `init.ts`: single templates-repo model with `templates/manifest.json` (no CLI release to add a template); `--template` now accepts official names **or** any source (`gh:owner/repo[/subdir][#ref]`, tarball URL, local path); won't clobber a custom template's `capsule.config.ts`. `TEMPLATES_REPO`/`TEMPLATES_BRANCH` constants to confirm at GitHub-publish time.
- Deferred to publish: confirm published templates-repo org/name; company-registry config (`~/.capsulerc`); "Authoring a template" doc + template contract.

**Design decisions (2026-06-12)** — recorded in `Build/000-Roadmap.md` "Design decisions" + `Architecture/adr-002-capsule-ui.md`:
- **Compatibility:** frontend framework runs in the WebView (any framework/version OK); QuickJS only runs server routes — the real surface. Freeze the *contract* (bridge protocol + `@capsule/core` API + pinned QuickJS), not the framework. `capsule.lock` pins the shell; CI should build templates + run route bundles in QuickJS.
- **CLI updates:** prefer project-local devDep (pinned); update-notifier, no silent auto-update; `capsule upgrade` + `doctor` report versions.
- **Existing-project adoption:** CLI-assisted (`capsule init` in-place / `integrate`) — detect bundler, gen config + add core + `add android`; dev/build already wrap any bundler.
- **Capsule UI (future, Phase 5):** Tailwind + own iOS/Material preset + shadcn-style `capsule add ui` registry; daisyUI as structural model; Konsta as interim for React/Vue/Svelte. See adr-002.

**Immediate next:** ship optional `--css tailwind` (shared native preset reusing existing `.btn`/`.card`/`.tab` class names; default `--css none`), then regenerate the 7 from-template examples. Then Group 1/2 + device-release, then Step 7.

**TODO (deferred this session):**
- **Clear button parity** — propagate the Server-tab Clear button to the canonical `capsule-react-ts-template` and the other 6 frameworks (vue/svelte/angular/vanilla-js/vanilla-ts/jquery), both `templates/` sources and their `*-from-template` example copies (14 files), to preserve the "identical UI across all 7" guarantee. User chose example-only for now.

**Next:** Group 0.1 emulator-dev, then emulator-release; then remaining 0.x browser-dev.

All Phase 2 steps are implemented. The current focus is end-to-end testing across all 13 example apps and 4 environments.

**Test plan:** `docs/TEST_PLAN.md`

Test matrix: **browser-dev** · **emulator-dev** · **emulator-release** · **device-release**

| Group | Examples | What's covered |
|-------|----------|----------------|
| 0 | 7 from-template examples | `capsule init` output, tab nav, bridge.call, /api/ping, HMR |
| 1 | react-ts · react-ts-native · react-ts-tailwind | CSS, native APIs, routing |
| 2 | webpack-preact · rspack-lit · rollup-solid | Non-Vite transparent proxy, HMR via WebSocket |

Recommended order: Group 0.1 browser-dev → emulator-dev → emulator-release, then remaining 0.x browser-dev, then Group 2 browser-dev (proxy), then Group 1 emulator-dev.

### Working (as of last build)

- All 13 example apps build, install, and run on real Samsung device (prod mode — NanoHTTPD serving assets)
- `capsule dev android` — adb reverse + Vite HMR confirmed
- `capsule build android` — Vite build + Gradle assembleDebug → APK
- `capsule run android` — adb install + launch
- `capsule doctor` — all green
- All 6 native APIs exercised end-to-end (geolocation GPS real coords, haptics, clipboard, storage, alerts, device info)
- NanoHTTPD serving `assets/www/` in prod mode — verified on device
- QuickJS JNI engine live in AAR — 4 instrumented tests passing on emulator
- QuickJSBridge live: JSON-RPC calls route through QuickJS before hitting Kotlin — 4 instrumented tests passing
- NanoHTTPD routes `/api/*` to QuickJS — `handleHttpRequest()` implemented end-to-end
- Dev proxy (Option B): transparent HTTP proxy for non-Vite bundlers — webpack-preact, rspack-lit, rollup-solid — **Group 2 browser-dev verified (2026-06-15); gzip HTML-injection bug fixed**
- Crash-loop rollback (Step 7): CrashLoopGuard + FileBundleStore (active/previous) wired into CapsuleActivity; rolls back to last known-good bundle after 3 crashes in 60s (OTA network delivery still Phase 4)
- All 7 templates updated: Home tab + Server tab (bridge.call hello + GET /api/ping)
- All 13 examples regenerated from templates or extended with Server tab

---

## Completion checklist

```
Phase 1
[x] pnpm workspace + Turbo + tsconfig.base.json + ESLint + Prettier
[x] @capsule/core — full bridge + all 6 APIs + 36 TS unit tests
[x] @capsule/cli — all commands + capsule sync --frozen-lockfile
[x] capsule-android — all Phase 1 handlers + 24+ Kotlin unit tests
[x] 7 templates (vanilla-js, vanilla-ts, react-ts, vue-ts, svelte-ts, angular-ts, jquery-bootstrap)
[x] 13 examples — all tested on real device

Phase 2 — Embedded Runtime (Android)
[x] Step 1 — Interfaces + fakes + CapsuleRuntime + 15 unit tests
[x] Step 2 — NanoHttpdServer serves assets/www/ over HTTP
[x] Step 3 — WebViewSplashController + timeout + retry error screen
[x] Step 4 — QuickJS JNI embedding in AAR (4 instrumented tests passing)
[x] Step 5 — QuickJSBridge: @capsule/core runs in QuickJS (4 instrumented tests)
[x] Step 6 — File-based routing + NanoHTTPD /api/* routing
[x] Step 7 — codeSync crash loop + rollback (BundleStore + CrashLoopGuard, 25 new JVM tests)

Phase 3 — Native APIs Expansion
[ ] camera.capture + clipboard.readImage/writeImage
[ ] biometrics.authenticate
[ ] Push notifications (FCM / APNs)
[ ] telecom.getSimInfo / dial / call
[ ] sms.send / sms.read (opt-in)

Phase 4 — Ecosystem
[ ] GitHub org + CI/CD + npm publish
[ ] Docker images
[ ] Shell registry via GitHub Releases
[ ] Docs site

Phase 5 — DX
[ ] VS Code extension, error overlays, device inspector, Fastlane signing

Phase 6 — iOS
[ ] GCDWebServerImpl implements CapsuleServer
[ ] QuickJS compiled for iOS
[ ] WKWebViewSplashController
[ ] CapsuleRuntime untouched (reuse as-is)
```

---

## Session housekeeping (2026-06-06)

### quickjs-ng maintenance

- Vendored source updated to **v0.15.1** (already current)
- `src/main/cpp/quickjs/` **removed from .gitignore** — C source is versioned like any other source
- `.cxx/`, `*.o`, `*.a`, `*.ninja` added to .gitignore — CMake/NDK build artifacts ignored
- `scripts/update-quickjs.ps1` created — run to pull a newer release and re-copy files

### Design patterns in capsule-android

| File                      | Pattern                              |
| ------------------------- | ------------------------------------ |
| `BridgeHandler`           | Strategy + Self-registering Registry |
| `CapsuleBridge`           | Facade + Mediator                    |
| `CapsuleRuntime`          | Orchestrator + Template Method       |
| `QuickJSEngine` interface | Strategy interface                   |
| `QuickJSEngineImpl`       | Adapter (JNI → Kotlin coroutines)    |
| `NoOpQuickJSEngine`       | Null Object                          |
| `buildHandlers()`         | Factory Method                       |
| `CapsuleShellConfig`      | Configuration Object                 |

### Browser QuickJS testing — open question

**Q: The developer can change Vite to another bundler. Will Option B (Vitest/Jest in Node.js) still work?**

Yes — completely. Vitest tests `@capsule/core` source directly using its own internal bundler (esbuild). The app's bundler (Vite, Webpack, Rollup, Parcel, esbuild…) is irrelevant. Changing the app bundler has zero effect on the test suite. The 36 TS tests and any future Vitest tests will keep working regardless.

The only thing that changes between bundlers is the shape of `assets/www/index.js` (the app bundle). That is tested end-to-end on device, not by Vitest.

**Three browser testing options:**

- **A — quickjs-emscripten**: run the same C engine as WASM in Node.js — highest fidelity, tests that bundles actually execute in QuickJS before hitting the device
- **B — Vitest + happy-dom ✅ DONE**: test `WebBridge` (browser fallback) in a browser-like environment — bundler-agnostic, no device needed
- **C — Chrome DevTools on WebView**: `chrome://inspect` → connect to device WebView → run bridge calls in devtools console

### Option B implementation (2026-06-06)

**What was done:**

1. Added `happy-dom ^14.0.0` to `@capsule/core` devDependencies — provides browser globals (localStorage, navigator, DOM) in Vitest
2. Refactored `WebBridge.call()` — extracted private `dispatch()` method, replacing 10 repeated `as Promise<unknown> as Promise<T>` casts with a single cast at the call site
3. Added `packages/core/src/__tests__/web-bridge.test.ts` (`@vitest-environment happy-dom`) — 12 new tests

**Tests added (all passing):**

- `storage`: set/get round-trip, get missing key, remove, clear preserves external keys, keys returns stripped prefix
- `device.getInfo`: returns `platform:'web'`, `model:'Browser'`, correct defaults
- `haptics.vibrate`: resolves gracefully when `navigator.vibrate` absent
- `clipboard`: read returns null when API mocked away, write resolves silently
- `on / notification handler`: returns unsubscribe function, unsubscribe doesn't throw
- `unknown method`: rejects with `CapsuleError` code 1002

**Key note on `vi.spyOn`:** happy-dom implements `navigator.clipboard.readText()` (returns `''`). The "clipboard unavailable" tests use `vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined)` to simulate a browser with no clipboard API, then `vi.restoreAllMocks()` in `afterEach`.

**Total test count:** 40 → **51** (8 test files, all passing)

---

## Next: Phase 2 Step 6 — File-based routing + NanoHTTPD /api/* routing

Two sub-tasks (both deliver independent value, built together):

### Sub-task A — JSON-RPC file discovery
User creates `src/routes/device.getInfo.ts`, CLI bundles it, QuickJS intercepts that method before Kotlin.
- File: `src/routes/<method>.ts` (method name = filename without extension)
- Handler: `export default function handler(params) { return {...} }`
- CLI auto-discovers files and generates `addRoute("method.name", handler)` calls
- No registration needed — file presence = route registration

### Sub-task B — HTTP API routing
User creates `src/server/routes/users.ts`, NanoHTTPD routes `/api/users` to QuickJS.
- File: `src/server/routes/<name>.ts` (path = `/api/<name>`)
- Handler exports: `export function GET(req: CapsuleHttpRequest) { return { status: 200, body: '...' } }`
- NanoHTTPD intercepts `/api/*` and calls QuickJSEngine.call("handleHttpRequest", ...)
- @capsule/core/routes exports CapsuleHttpRequest, CapsuleHttpResponse, addHttpRoute, handleHttpRequest
- Framework-agnostic: completely independent of Angular/React/Vue client routing

### Bundle path correction
`assets/www/routes.js` → `assets/server/bundle.js`. Server code must not be served as a static asset.
QuickJSBridgeImpl and build.ts both updated to use the new path.

### Dev mode
Server routes (A + B) only work in prod mode (NanoHTTPD + QuickJS).
Dev mode Node.js process is deferred (ADR §8 — later step).

---

## Automated test harness (delivered 2026-06-12)

The previously-parked "test the templated app" idea is now shipped as an **opt-in**
toolchain (`capsule init --test vitest`, mirroring `--css tailwind`). Four layers:
route-contract + route units + component (FakeBridge) + QuickJS-fidelity, an
HML-gated integration test, a `capsule test` command, and an on-device Espresso-Web
smoke test generated into the Android scaffold. Full design, how-to, wiring, and
verification status: **`docs/Build/070-Testing.md`**.

- Catches the exact 404 class we hit this session (missing `src/routes`/`src/server/routes`
  files) statically — proven by removing `hello.ts` and watching the contract test fail.
- Replaces most manual install→screenshot→eyeball loops with seconds-long, hermetic checks.
- Wired for **all 7 frameworks** (react/vue/svelte/vanilla-ts/vanilla-js/jquery with
  component tests; angular ships agnostic tiers only — TestBed/analog component test
  is the remaining follow-up). All verified green in their from-template examples.

---

## Session resume

```powershell
$env:JAVA_HOME = "<jdk-17>"
$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH
$env:CAPSULE_SHELL_OVERRIDE_PATH = "<repo>\packages\capsule-android\capsule\build\outputs\aar\capsule-debug.aar"
cd <repo>
```

**Current focus: Phase 3 Native APIs — Camera ✅ + Filesystem ✅ done (2026-06-16). Next is Phase 3 #2 App lifecycle + deep links, then network status / push / etc., then Phase 4 iOS, then Phase 5 Server Code Push / OTA cloud. See the 2026-06-16 session entry above and `docs/Build/000-Roadmap.md`.**

---

## 2026-06-15 — Strategy session (business model + iOS sequencing + migration)

No code changes; this session set product/business direction and reorganized the roadmap. New docs:

- **`docs/Architecture/ionic-framework7-migration.md`** — Ionic/F7 UI migrates ~free (they're web UI
  libs; Capsule serves any bundle); the work is native plugins → importer + a `@capsule/compat-capacitor`
  shim (alias `@capacitor/*`, zero app-code change for Level-1 plugins). Worth it as a GTM on-ramp, never
  a runtime compat layer. Table-stakes: `App`/`Keyboard`/`StatusBar` bridge equivalents.
- **`docs/Business/000-Business-Model.md`** — open-core SaaS. Framework free/OSS + self-hostable server
  (defuses the CodePush "unlimited free bandwidth" death). Market timing: App Center retired Mar-2025 /
  CodePush dead / Appflow expensive. ICP: **agencies first**, freelancers as the free-tier funnel.
  Meter on **MAU + bandwidth, not deploy count**. Flagship paid = **canary + auto-rollback** (monetizes
  the Step-7 crash-loop guard) + **multi-tenant**. MCP = distribution channel (mostly free), AI
  app-builder = deferred scope creep. Store story = `codesync publish` (OTA, no review) + `publish`
  (automated submission); headline "most updates never touch the store."
- **`docs/Business/010-Pricing.md`** — tiers (Community self-host / Free 1k MAU / Pro ~$49 / Team ~$199 /
  Business ~$499 / Enterprise custom); MoR payments (**Paddle/Lemon Squeezy** first for VAT, Stripe at
  scale); 14-day Team trial, free tier forever, annual ~17% off. Numbers illustrative — validate.
- **`docs/Business/020-OTA-Policy-and-Liability.md`** — customer owns store compliance (tool-vendor
  posture; CodePush/Expo/Appflow precedent). Shield with ToS/AUP + non-evasion marketing. Build the
  **deterministic capability gate** (`minNativeVersion`/permissions/native → force `publish`); semantic
  "primary purpose" check = best-effort warn + acknowledgment + audit log. Watch the **QuickJS-vs-
  JavaScriptCore** clause (Hermes/CodePush precedent says tolerated).
- **`docs/Build/080-iOS-BringUp.md`** — iOS pulled ahead (was Phase 6 → Phase 4; after native APIs,
  before the OTA cloud which needs cross-platform). **No Mac purchase yet:** Simulator covers unit+integration tiers; GitHub Actions
  macOS works on private repos (10× metered) and is free when public — matches "go public at launch."
  Recent-macOS VM only as throwaway interactive scratchpad (EULA-gray); Lion is useless. Interface-first
  Swift/QuickJS port mirrors the Android runtime classes.
- **`docs/Build/090-Infrastructure.md`** — bandwidth is the OTA margin driver; AWS/Azure egress ~$0.08/GB
  vs Hetzner ~€1/TB vs R2 $0 egress. **Data plane on R2/Hetzner+CDN, control plane on Hetzner k8s;**
  AWS/Azure reserved for enterprise data-residency/on-prem (billed). Differential updates cut bandwidth.

Roadmap (`docs/Build/000-Roadmap.md`) re-sequenced (revised — capability first): Phase 3 native APIs →
Phase 4 iOS → Phase 5 OTA cloud → Phase 6 migration on-ramp → Phase 7 ecosystem → Phase 8 DX. Much of the Server Code Push *technical*
design already existed (`docs/Server/*`, `050-Publishing.md`); this session added the strategy/business
layer and the sequencing, not new technical specs.

---

## 2026-09-30 — CodeSync API delivery + CLI cross-platform + public-repo cleanup

- **`packages/codesync-api`** — local file-based CodeSync server implemented and E2E-verified with curl:
  health/bundles/manifest/publish/releases/rollback/pause/resume/devices; auth via `x-api-key` +
  `CODESYNC_API_KEY` env; duplicate version → 409; ETag on bundle responses. **@fastify/multipart v7
  gotcha:** `data.fields` values are `{ type: 'field', value, … }` objects, not plain strings — the
  publish endpoint unwraps `.value` (a plain-string cast fails `parseInt` with "buildNumber must be integer").
- **CLI cross-platform (de-Windows):** the PowerShell setup scripts replaced by a single Node script
  (`scripts/capsule.js` at the framework root) + new CLI commands `env`/`emulator`/`examples`/
  `update-quickjs` (`packages/cli/src/commands/`) with shared logic in `packages/cli/src/lib/devsetup.ts`;
  `resolveShellProjectRoot` now checks both `gradlew.bat` and `gradlew`.
- **Public-repo cleanup:** framework-root junk removed (empty `cap.js`, stale `server.pid`, empty
  `node_modules`, duplicate generated `site/`, truncated root `api-spec.yaml`);
  `HANDOFF_NOTES.md` + `mkdocs.yml.backup` deleted; `.gitignore` now covers `site/` and
  `packages/codesync-api/storage/`. Secret scan clean. Roadmap Phase 6 status updated to match.
- **Pending:** CLI `capsule codesync publish` command; on-device OTA fetch client in `packages/core`;
  CI docs job installs plain `mkdocs` but `mkdocs.yml` requires the material theme
  (`pip install mkdocs mkdocs-material` in the workflow fixes it); carried-over items unchanged
  (network instrumented test, first dependency sweep, etc.).
- **Docs vault (tracking + navigation):** the repo is now self-navigating for agents —
  `AGENTS.md` at the root (task/target/files/navigation contract + per-file update rules);
  `docs/CONTEXT.md` rewritten for the actual layout (docs live in this repo; examples/templates/scripts
  are sibling repos) + a packages files-map; `docs/index.md` gained a Packages section; per-package
  READMEs (`packages/*/`) pointing up; root `README.md` re-linked (dead links removed: missing
  `codesync-api/README.md`, case-wrong `docs/build/`); `LICENSE` (MIT) added — the old README
  referenced a nonexistent one. **Vault check:** `pnpm docs:check` (`scripts/docs-check.mjs`) —
  case-exact nav resolution, map-level link resolution, orphan warnings. It caught that `docs/index.md`
  was referenced everywhere as `INDEX.md` (case drift — invisible on NTFS, 404 on Linux) and that
  `mkdocs.yml` nav listed every area dir lowercase (`build/` vs `Build/` — Linux CI breakage).
  Nav case fixed; the `Examples/Scripts/Templates` nav sections pointing at sibling repos were
  dropped (they can't resolve under `docs/`); public docs are this repo only.
  Running the sibling checker (`../scripts/docs-check/bin/docs-check.mjs --docs docs`) then exposed
  18 pre-existing dead links from the old layout (`../../capsule/…` → `../../packages/…`,
  `../../examples/README.md` → `../../../examples/README.md`) across `Build/010`, `Build/035` and all four
  Primers — all fixed; **both checkers now report 0 failures / 0 warnings over 62 docs.**


## 2026-09-30 — earlier session log (unverified)

> Kept verbatim from a second HISTORY.md that sat at the repo root. These entries were written by an
> earlier agent session and were **not verified**: the iOS and CodeSync "skeletons" they describe were
> placeholders, and the PowerShell ZIP step was later replaced (see the 2026-10-24 entry).

### 2026-09-30

- Implemented the CLI `capsule codesync publish` command (Phase 6).
- Updated the roadmap to mark the CLI `codesync publish` as done.
- The command builds the web bundle, bundles server routes (if any), creates the OTA bundle ZIP, computes its SHA-256, and sends it to the CodeSync server via a multipart POST request.
- Tested the command structure and verified it runs successfully until the HTTP request (which fails because the CodeSync server is not running, as expected).
- All existing CLI tests pass.

### 2026-09-30 (continued)

- Created the skeleton for the iOS native shell (Phase 4) in `packages/capsule-ios`.
- Added placeholder Swift files for:
  - CapsuleViewController (main view controller)
  - CapsuleBridge (JSON-RPC 2.0 dispatcher)
  - CameraHandler (example native API handler)
  - WebBridge (development fallback)
  - CapsuleRuntime (runtime coordinator)
- Created the directory structure mirroring the Android package for consistency.
- Added a README.md with build instructions and overview.
- Note: This skeleton is intended for development on a macOS machine with Xcode. On Windows, the files are created but cannot be built or tested.

### 2026-09-30 (continued)

- Implemented the JavaScript API for the on-device OTA fetch client (part of Phase 6) in `packages/core/src/codesync.ts`.
- Added the CodeSyncModule class with methods for:
  - `checkForUpdate()` - Manually check for an available update
  - `getStatus()` - Get the current update status
  - `applyUpdate()` - Apply a previously downloaded update
- Updated `packages/core/src/index.ts` to export the `codesync` singleton and re-export the related types.
- Created a comprehensive test suite in `packages/core/src/__tests__/codesync.test.ts` following the established patterns.
- All core and CLI tests pass.
- This implements the JS/API layer of the on-device OTA fetch client; the native implementation (in Android Java/Kotlin and iOS Swift) remains to be done separately.

### 2026-09-30 (continued)

- Created the native-side skeleton for the on-device OTA fetch client for Android:
  - Added OkHttp and Guava dependencies to gradle version catalog
  - Created `CodeSyncManager.kt` in `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/codesync/`
  - Integrated CodeSyncManager with CapsuleActivity and CapsuleBridge
  - Added CodeSync method handlers to CapsuleBridge (checkForUpdate, getStatus, applyUpdate)
  
- Created the native-side skeleton for the on-device OTA fetch client for iOS:
  - Created `CodeSyncManager.swift` in `packages/capsule-ios/capsule/src/main/swift/dev/capsule/runtime/`
  - Updated CapsuleRuntime.swift to include and delegate to CodeSyncManager
  - Updated CapsuleViewController.swift to initialize CodeSyncManager, CapsuleBridge, and CapsuleRuntime
  - Updated CapsuleBridge.swift to accept and delegate to CodeSyncManager
  
- Note: These are skeleton implementations intended to establish the code structure.
  Actual implementation would require:
  - Proper HTTP client usage (OkHttp for Android, URLSession for iOS)
  - Proper JSON parsing (Moshi/Gson for Android, Codable for iOS)
  - Proper ZIP extraction (java.util.zip for Android, SSZipArchive or similar for iOS)
  - Proper integration with existing bundle storage and crash loop protection
  - Proper handling of update strategies (background, immediate, on-next-launch)
  - Proper error handling and edge cases

### 2026-09-30 (continued)

- Refactored the CLI `codesync publish` command (`packages/cli/src/commands/codesync.ts`) to improve reliability and security:
  - Use OS temporary directory (`os.tmpdir()`) with a unique UUID-based subdirectory to avoid conflicts and permission issues.
  - Ensure cleanup of temporary files and directories via a `try/finally` block, guaranteeing removal even if an error occurs.
  - Improved error handling: each critical step (ZIP creation, HTTP request) is wrapped with meaningful error messages.
  - Maintained the same functionality: builds web bundle, bundles server routes, creates OTA manifest, creates ZIP via PowerShell `Compress-Archive`, computes SHA-256, and sends multipart POST to the CodeSync server.
  - All existing tests continue to pass.

## 2026-10-15

- **Fixed the Android build + hardened the CodeSync skeleton** (it did not compile after the
  2026-09-30 session):
  - `gradle/libs.versions.toml`: missing closing quote on `androidx-test-ext-junit` (blocked
    every build) and invalid Guava version `33.0.0` -> `33.3.1-android`.
  - `build.gradle.kts`: `okhttp` + `guava` were declared in the catalog but never referenced.
  - `CodeSyncManager.kt` rewrite: wrong OkHttp 2.x package (`com.squareup.okhttp` -> `okhttp3`),
    missing imports, and `CapsuleShellConfig` lacked the CodeSync fields it read. Now fully
    injected (`CodeSyncTransport` / `CodeSyncStore` / `BundleStore` seams + fakes), suspend API,
    real SHA-256 verification (Guava), real ZIP extraction with **zip-slip protection**, real
    JSON decode (kotlinx.serialization) — the old placeholders silently returned success.
  - **Contract bug fixed**: `isInRollout` used `Math.abs(hash.asInt()) % 100`, which assigns a
    different rollout bucket than the TypeScript reference for ~half of all device ids (signed
    vs unsigned 32-bit). Now computed from the unsigned hash; pinned by test vectors generated
    from `murmurhash3js-revisited`. A second latent bug (mask-then-`toInt()` overflow) was caught
    by the new flow tests and fixed. **Follow-up**: the same vectors should pin the Kotlin side
    (done in `RolloutTest`) and any server-side implementation.
  - `CapsuleBridge`: the skeleton constructed `BridgeHandler` (an interface) as a lambda;
    CodeSync now has proper `BridgeHandler` classes (`codeSyncHandlers(manager)`) registered via
    the normal handlers list — the bridge no longer knows about CodeSync at all. Bridge status
    strings match `@capsule/core` exactly ("download ready", with the space).
  - `CapsuleActivity`: CodeSync client built in `onCreate` (before the bridge) when
    `capsuleConfig.codeSync != null`; `loadApp` crash-loop guard now records the launch attempt.
  - Android unit tests: **168 passing** (24 suites), including new `RolloutTest` (TS vectors),
    `CodeSyncModelsTest`, `CodeSyncUnzipperTest`, `CodeSyncManagerTest` (full flow over fakes).
  - JS core tests re-run: 135 passing (no drift).

- **iOS Phase A (xtool plan): SwiftPM conversion + the Android testing discipline**, executed
  with docs-in-tow:
  - `packages/capsule-ios/capsule/Package.swift` (deps: swift-crypto for SHA-256, ZIPFoundation
    for extraction — both Apple + Linux). Sources moved `src/main/swift/dev/capsule/` ->
    `Sources/dev/capsule/`.
  - Full port of the runtime seams: `Clock`/`CrashLog`/`CrashLoopGuard` (pure logic),
    `BundleStore`/`FileBundleStore` (URL-based — the neutral type the 080 audit asked for),
    `CapsuleRuntime` platform-neutral behind a `Bridging` protocol.
  - Full port of the CodeSync client: `CodeSyncManager` (check -> rollout -> download -> verify
    -> extract -> install), wire models mirroring `@capsule/core`, `MurmurHash3` in pure Swift,
    `Rollout` (unsigned semantics by construction), `CodeSyncUnzipper` (zip-slip protection),
    `CodeSyncHTTPClient` (URLSession via continuations — Apple + Linux) and
    `CodeSyncPreferences` (UserDefaults, Darwin-guarded).
  - Platform-edge placeholders (CapsuleViewController, CapsuleBridge, CameraHandler) wrapped in
    `#if canImport(UIKit/WebKit)` so the neutral core compiles and tests on Linux.
  - Tests mirror the Android suites one-to-one (fakes per protocol; shared TS murmur vectors).
    **52 tests, 0 failures, run in `swift:6.3-jammy` Docker** — no Apple hardware involved.
    Notable: ZIPFoundation's `extract` refuses existing destinations; the unzipper now removes
    destinations before extract (re-extraction parity with Android).
  - `packages/capsule-ios/README.md` rewritten for the new layout + testing discipline.
  - Next: Phase B of `PLAN_XTOOL_IOS.md` (workspace root) — container image + one-time Apple
    auth + `xtool sdk install iphoneos`, then the device build (Phase C).

## 2026-10-15 (continued)

- **Analyzed + planned the embedded-server startup race** (reported from emulator + real-device
  cold-start testing: splash reveals an error page instead of waiting for the server):
  - Root cause verified against the `nanohttpd-2.3.1` bytecode (not guessed): `start()` creates an
    UNBOUND ServerSocket and returns before the thread's `bind()` runs — so `CapsuleServer.start()`
    returns before the server accepts connections; the WebView races the bind (`ERR_CONNECTION_REFUSED`),
    the documented 3s bind timeout is dead code, and port collisions die silently in a private
    `bindException` field.
  - Analysis + fix plan: `docs/Build/125-Embedded-Server-Startup.md` (readiness probe, bind retry,
    WebView main-frame retry, error surfacing; phases SR-1..SR-5).
  - adr-001 #6 amended with the explicit contract: `CapsuleServer.start()` returns only when the
    server accepts connections.
  - Roadmap: S1 (bind race, fix at next code session) + S2 (related finding: NanoHttpdServer serves
    only `assets/www/` — OTA-installed bundles are never served; needed for on-device CodeSync).
  - `pnpm docs:check` green (58 pages).
- Note: xtool Phase B (container image) was started and is parked mid-way — release artifacts
  identified (xtool-aarch64/x86_64.AppImage @ 1.22.2); resume after SR-1..SR-5.

## 2026-10-19 — BundleStore contract fix · iOS Tier-4 reference drafts · Capsule UI foundation

- **BundleStore de-`java.io.File`d** (the one nit from the 2026-06-26 iOS contract-readiness audit):
  - `BundleStore` interface now `activeDir(): String?` / `install(stagedPath: String)` — a literal
    cross-platform contract; `java.io.File` stays inside `FileBundleStore` (implementation detail).
  - Call sites migrated: `CapsuleActivity` (filesDir path string), `CodeSyncManager.install`
    (staged dir path string), `FakeBundleStore` + `FileBundleStoreTest` (String paths throughout).
  - `compileDebugKotlin` green; `testDebugUnitTest` blocked by a Windows test-results dir lock
    (OS file-handle issue, not code — compile tier is green; re-run on next session).
- **iOS Tier-4 reference drafts** (no macOS available — drafts, not wired):
  - `docs/Build/Tier4/CapsuleGCDWebServer.swift` (GCDWebServer-backed `CapsuleServer`, SR-1..SR-5
    readiness contract mirrored), `docs/Build/Tier4/CapsuleQuickJSBridge.swift`
    (`QuickJSBridgeProtocol` + `HttpRouteResponse` + engine wrapper stub).
  - `objective-c/quickjs_bridge.h/.m` — C bridge sketch (runtime/context/eval/call/dispatcher/
    stack-base) mirroring the Android JNI surface. Placement into `packages/capsule-ios/Sources`
    pending the next iOS session.
- **Phase 5 started — Capsule UI foundation** (`packages/ui-kit`, adr-002 direction):
  - **Framework-agnostic by design**: Tailwind *class builders* (pure TS, no JSX, no React dep) so
    react-ts/vue-ts/svelte-ts/vanilla-ts templates all consume the same look; behaviour stays in
    each template. (First-cut React `.tsx` components were discarded — React-only contradicted the
    multi-template goal and shipped before being tested.)
  - `tokens.ts`: iOS + Material presets (radius/control-height/font) + `cn` merger.
  - Six builders: `button` (5 variants × 3 sizes × presets × block), `card` (+header/description/
    footer), `input`/`textarea`/`fieldLabel` (invalid states), `dialog` (overlay/panel/title/body/
    footer), `select` (native-picker styling), `table` (striped/hoverable rows).
  - **Verified**: `tsc --noEmit` clean (strict), build emits `dist/`, **15/15 node:test green**
    (`node --test`, zero test deps) pinning variant/preset/invalid-state contracts.
  - Workspace member via `packages/*` glob; `pnpm test` script = `node --test`.
- Roadmap: Phase 5 status ⬜ → 🔄 (foundation). STATE.md unchanged (SR-1..SR-5 still next action).

## 2026-10-24 — CivetWeb server · SQLite `db` · `ai` Tier 1 · public-release prep · docs by reader

- **Uncommitted WIP from earlier sessions was placeholder code** (a non-compiling JNI/Swift "Civetweb
  migration", an emptied `NanoHttpdServer.kt`, weakened server tests, a SQL-injection-prone `sql` tag,
  fake return values, CLI regressions). Archived outside the repo and rebuilt:
  - **Embedded server → CivetWeb on both platforms** (release v1.16 vendored at `packages/native/civetweb`;
    the master snapshot did not compile). Android `CivetwebServer` + JVM-tested `RequestRouter` + JNI glue;
    iOS `CivetwebServer.swift` + `RequestRouter.swift`; `Package.swift` moved to the repo root; NanoHTTPD
    removed. Readiness holds by construction; `stop()` is non-blocking. See decision 0004's amendment and
    `project/incidents/2026-10-embedded-server-startup.md`.
  - **SQLite `db`** (per `reference/core-api.md` → `guide/database.md`) and the **`ai` Tier-1 spike**
    (adr-003 → `guide/ai.md`, ML Kit Prompt API) — built ahead of their roadmap slot at the user's request.
  - **CLI:** `capsule add <platform>` restored, `capsule add-ui` rebuilt, the mobile CSS reset moved into the
    CLI, the OTA ZIP built with `archiver` (no PowerShell); generated apps get OkHttp/Guava/ML Kit.
- **Public-release prep:** Apache-2.0 + AGPL-3.0 (`codesync-api`), NOTICE, CONTRIBUTING, SECURITY,
  CODE_OF_CONDUCT; employer references removed; PowerShell `scripts/` repo replaced by Node `scripts/*.mjs`
  (`pnpm dev:*`, `pnpm verify`); `examples/` folded into the monorepo; QuickJS moved to
  `packages/native/quickjs`; `packages/capsule-ios` flattened; CI moved to GitHub Actions (Linux + macOS).
- **Docs reorganised by reader** — `guide/`, `reference/`, `concepts/`, `decisions/`, `contributing/`,
  `project/`; the two HISTORY files merged here; `TEST_PLAN.md` merged into `contributing/testing.md`;
  `docs/CLAUDE.md` deleted (`AGENTS.md` is the single entry point).
- **Agent harness:** a short root `AGENTS.md` (single entry point) plus one per package; `CLAUDE.md`,
  `GEMINI.md` and `.github/copilot-instructions.md` point to it. Rules that lived only in agent memory
  moved into the repo.
- **Docs ↔ code:** front matter (`audience`, `status`, `code:`/`tests:` globs) on every page, a
  `// Docs:` header in 228 source files, `docs:check` rules R1–R4, and generated reference pages
  (`pnpm gen`: TypeDoc core API, CLI, config, docs map, plus the CLI's Android toolchain module).
  The CodeSync doc split into `guide/ota-updates.md` + `contributing/codesync-internals.md`, whose
  **Known gaps** list records why OTA does not work end to end yet.
- **Version tracking:** `pnpm upkeep` (one report: store rules, Android, vendored C + advisories,
  Swift/Xcode, Node), `requirements.json` store rules, `capsule doctor` store checks, Renovate and a
  weekly upkeep workflow. First sweep (`contributing/upkeep.md` → Sweep log): targetSdk/compileSdk 36
  (Play's rule since 2026-08-31) on AGP 8.13.2 / Gradle 8.14.6 / Kotlin 2.3.21, QuickJS 0.17.0 (two
  high advisories in 0.15.1), swift-crypto 5, the Swift 6.4 image, npm advisories 87 → 0.
- **Fixes found on the way:** bridge 1xxx error codes now match between Kotlin and TS; Android
  `CodeSyncManager` records the installed bundle (it never did); `codesync publish` builds its
  multipart request correctly; `capsule doctor` enforces tool minimums; docs-lint's link check works
  on Windows (it skipped every missing target there).
- **Verified:** `pnpm verify` green (format, lint, typecheck, tests — core 168, cli 63, codesync-api
  2, scripts 59 — docs:check, gen:check, docs:lint); Gradle `assembleDebug` + `testDebugUnitTest`
  212/212 and `assembleRelease`; Swift 89/89 on `swift:6.4-jammy`; a generated app
  (`examples/react-ts`) syncs and builds.
- **First device run (API 36 emulator)** found seven bugs the JVM/Linux tiers can't see, all fixed:
  1. `db` `insertId` missing when an insert repeats the connection's previous rowid (Android writes
     `android_metadata` on open) — both platforms now reset `last_insert_rowid` to a sentinel around
     the statement and restore it.
  2. Android port-in-use check probed `::1` (`getLoopbackAddress()` is IPv6 on Android) while CivetWeb
     binds `127.0.0.1` — a held port was reported as a generic failure.
  3. Flaky `CodeSyncManagerTest` — zip entry timestamps made two fixtures differ byte-for-byte.
  4. targetSdk 36 forces edge-to-edge: the page drew under the status bar — the shell now pads the
     WebView by the system bar, cutout and keyboard insets.
  5. Native notifications sent before the page's bridge exists threw a TypeError — now dropped.
  6. **Every app used the default `appId`, so every app got the same port** — the second Capsule app
     on a device failed to start. `appId` now defaults to the package name / bundle id (ADR-0001 #7
     amended).
  7. Kotlin 2.4.21 is newer than AGP 8.13's R8 reads ("error … parsing kotlin metadata") — back to
     2.3.21, and `pnpm upkeep` now flags a Kotlin beyond the AGP's R8 as 🔴.
  Startup failures are now logged (they reached the error screen with no log line).
- **Verified on the emulator:** `connectedDebugAndroidTest` 51 passed / 2 skipped (Gemini Nano — no
  on-device model), JVM 212, SR-4 (20 cold starts + 10 relaunches: every launch rendered), the
  `react-ts` release build end to end (page → bridge → CivetWeb → QuickJS route), all example release
  builds installed and launched.
- **Templates + examples brought current:** Angular 19 → 22 (zoneless, TS 6.0), rspack 2, vite ≥ 6.4.5,
  `type: module`, `@capsule/core ^0.1.0`; all 7 templates install and build clean; examples' npm
  advisories 45 → 2 accepted moderates, templates → 0.
- **Published:** `alex-vinny/capsule_framework` (this repo) and `alex-vinny/capsule-templates`, both
  public, each a fresh single-commit history under the GitHub noreply author (the private histories
  are kept outside the repo). Docs site on GitHub Pages from `gh-pages`. Nothing on npm/Maven yet (D5).
- **First CI runs on GitHub** found five more, all fixed (`b7160df`, `62dbfb8`):
  1. `docs:check` walked paths from a Windows drive root only — the POSIX walk never matched.
  2. CivetWeb's `struct ah` clashed with a Darwin header under clang modules (macOS SwiftPM).
  3. mkdocs `--strict` rejected links from `docs/` to files outside it.
  4. `CapsuleBridge` must inherit `NSObject` to be a `WKScriptMessageHandler` — invisible to the
     Linux job because the file sits behind `#if canImport(WebKit)`.
  5. `docs-map.md` was stale (`gen --check`).
  Every job green on `62dbfb8`: JS, Android build + JVM, the emulator job, Swift Linux, Swift macOS, docs.
- **GitHub setup:** `main` protected (required: JS, Android build, Swift Linux, Swift macOS; no
  force-push or deletion; admins exempt). A push cancels a running manual CI dispatch on the same
  branch (shared concurrency group) — dispatch again after pushing.
- **Fresh-clone check:** the setup docs still said SDK platform 35, Gradle 8.10, AGP 8.7 and the old
  org URL — `contributing/environment.md`, `commands.md` and `docker.md` now say platform 36, NDK
  27.3.13750724, CMake 3.22.1, Gradle 8.14.6, AGP 8.13.2 and `alex-vinny/capsule_framework`. CI's
  `NDK_VERSION` (27.2) disagreed with `ndkVersion` (27.3) and now matches.
- **Logo:** direction A (split pill) chosen; the pair (Graphite / Lagoon / crosses), the gap and the
  angle are still open — then export SVG, favicon, Android adaptive and iOS icon sets.
