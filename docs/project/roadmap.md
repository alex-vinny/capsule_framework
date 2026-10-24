---
title: "Roadmap"
audience: everyone
status: current
---
# Capsule Framework — Implementation Overview

> This folder contains the step-by-step implementation guide for building the Capsule Framework itself — the CLI, native shells, core SDK, and CodeSync infrastructure.
>
> Prerequisites: machine setup complete (`environment.md`). GitHub org and CI/CD are Phase 8 (Ecosystem).

---

## Implementation Phases

> **Re-sequenced 2026-06-15** (strategy session, revised). Capsule is a personal project — **not racing
> for funding**, so capability comes before monetization: **native-API expansion stays Phase 3**, then
> **iOS**, then **Capsule UI** (native-look layer, Phase 5 — slotted after iOS so its presets target a real
> iOS shell), then the **Server Code Push / OTA cloud** (the eventual funding engine, gated on iOS) and the
> migration on-ramp. The strategy/business docs ([../Business/](business/business-model.md))
> still hold — they're just sequenced later. The old phase *content* is preserved; only order changed.

| Phase | Deliverable | Status |
|-------|------------|--------|
| **Phase 1 — Foundation** | CLI (`capsule init/add/sync/dev/build/run`) + Android shell (Kotlin AAR) + 6 native APIs (geolocation, camera, haptics, push, biometrics, alerts) + templates + WebBridge (browser dev fallback) | ✅ Done |
| **Phase 2 — Embedded Runtime (Android)** | Embedded HTTP server (NanoHTTPD; replaced by CivetWeb 2026-10-24 — adr-004 amendment) + QuickJS on-device JS runtime + CapsuleRuntime coordinator + file-based route handlers + atomic CodeSync bundles + crash-loop rollback | ✅ Steps 1–7 complete · Group 0 + Group 2 browser-dev e2e tested (OTA *network delivery* deferred to Phase 6) |
| **Phase 3 — Native APIs Expansion** | Ordered (foundational → specialized): **Camera ✅ → Filesystem ✅ → App lifecycle + deep links ✅ → Network status ✅ → Push (FCM/APNs) → Local notifications → Biometrics → Status bar / Keyboard / Share → SQLite `db` → `ai` inference (Tier-1 OS-native spike, see [adr-003](../decisions/0003-ai-and-agents.md)) → NFC / Bluetooth → Background jobs → Telecom / SMS.** Every API honours two OTA-driven constraints — persist user data *outside* the OTA-swappable bundle dirs, and carry a native-capability version (see "Phase 3 ordering" below). | 🔄 Camera + Filesystem + App lifecycle/deep links + Network status done · SQLite `db` + `ai` Tier-1 spike built out of order (2026-10-24, device tests pending) · rest ⬜ |
| **Phase 4 — iOS** *(pulled forward, was Phase 6)* | CivetWeb — the same C server as Android, ✅ built + Linux-tested (embedded loopback HTTP server → `http://127.0.0.1:{port}/`, **symmetric with Android** — `WKURLSchemeHandler` rejected, see [adr-004](../decisions/0004-web-serving-transport.md)) + QuickJS compiled for iOS + WKWebView shell — same `capsule.config.ts`, same TS route handlers. **No Mac purchase needed for bring‑up** — see [ios-bring-up.md](../contributing/ios-bring-up.md). **Now using xtool / XKit** for cross‑platform SwiftPM build and optional helpers (networking, crypto, device management). **Contract‑readiness audit (2026‑06‑26): the Android interfaces are essentially iOS‑ready — seam is at the provider/controller boundary, only platform‑edge glue leaks `android.*`; QuickJS C lib compiles unchanged (only the JNI glue is re‑written). Tiered breakdown + the one `BundleStore`/`java.io.File` nit in `080`.** In progress – SwiftPM conversion + tested CodeSync client core done (2026-10-15, Linux-tested via Docker); next: xtool container build + Apple auth |
| **Phase 5 — Capsule UI** *(native-look component layer)* | `capsule add-ui` (shadcn-style; shipped 2026-10-24 — copies ui-kit class builders) + shared iOS/Material Tailwind preset + per-framework behaviour — "Capsule's own Konsta". **Slotted after iOS so the iOS/Material presets target a real WKWebView shell and the native *look* is proven on both platforms** (the native *capabilities* already land in Phase 3). Pure frontend/CSS — touches no native APIs. See [adr-002](../decisions/0002-capsule-ui.md). | 🔄 Foundation done — framework-agnostic class builders + iOS/Material presets in `packages/ui-kit` (tsc strict clean, 15/15 tests green); `capsule add-ui` shipped (2026-10-24); per-framework adapters next |
| **Phase 6 — Server Code Push / OTA Cloud** *(the funding engine)* | OTA network delivery (`capsule codesync publish` + on-device fetch — the deferred half of Step 7) + Portal/control plane ([server design](server-design/overview.md)) + **canary + auto-rollback** + multi-tenant + metrics/logs + billing. **+ AI agent layer** (native bridge as agent tool surface) + **hybrid/on-device inference** (Cactus/llama.cpp Tier 2) + **cloud inference** (metered, Tier 3) + **OTA-updatable agent logic** — see [adr-003](../decisions/0003-ai-and-agents.md). | 🔄 Server *design* done + **local self-hosted server implemented & E2E-verified** (`packages/codesync-api`); **CLI `codesync publish` done** + **on-device fetch client JS/API implemented** + native implementation pending + portal + billing + AI/agents pending |
| **Phase 7 — Migration On-Ramp** *(go-to-market)* | `capsule migrate ionic` + `@capsule/compat-capacitor` shim + plugin importer (Capacitor/Cordova → Capsule ABI). Acquisition funnel — can overlap Phase 6. See [../concepts/ionic-framework7-migration.md](../concepts/ionic-framework7-migration.md) + [research/chatgpt-plugin-compatibility.md](research/chatgpt-plugin-compatibility.md). | ⬜ Not started |
| **Phase 8 — Ecosystem** | GitHub org, publishing pipeline, CI/CD, npm publish, Docker images, Shell registry via GitHub Releases, **template registry**, docs site. **OSS/package release readiness — repo-target, docs split, license, de-Windows, npm+Maven publish — is captured as pending decisions + a pre-publish checklist in [release.md](../contributing/release.md)** (the public-launch flip itself is gated at Phase 6, see D1/D6 there). | 🔄 Template extensibility ✅; publish pending (decisions logged: `release.md`) |
| **Phase 9 — DX** | VS Code extension, error overlays, device inspector, Fastlane signing automation | ⬜ Not started |

**Start here**: [cli.md](../reference/cli.md) (CLI) → [architecture.md](../concepts/architecture.md) (core + Android shell)
**Strategy & business**: [business/business-model.md](business/business-model.md) · [business/pricing.md](business/pricing.md) · [business/ota-policy-and-liability.md](business/ota-policy-and-liability.md) · infra [infrastructure.md](infrastructure.md)

**Recurring upkeep (cross-cutting, all phases)**: a periodic dependency & tooling audit —
QuickJS-ng, CivetWeb, Android SDK / Play `targetSdk`, Gradle/AGP/Kotlin/NDK, CLI + core npm deps,
and the templates — runs **at every phase kick-off, before each release, and quarterly**. Routine,
baseline, and sweep log: [upkeep.md](../contributing/upkeep.md). (iOS toolchain added there in Phase 4.)

**HTTP fidelity roadmap (embedded server, both platforms — [adr-004](../decisions/0004-web-serving-transport.md))**:
the on-device `/api` server delivers a *full web experience*, tiered so each step is realistic and works properly:

| Capability | Status / phase |
|---|---|
| Static serving + request/response `/api/*` (GET/POST/PUT/DELETE) | ✅ Android (Phase 2) · Phase 4 for iOS parity |
| **Streaming responses** (chunked) | Phase 4 parity target |
| **WebSockets** (`ws://localhost`, on-device real-time) | ⬜ Future — needs a **new core route model** (`onOpen`/`onMessage`/`onClose`) + single-thread-engine frame pumping. *Designed, not excluded. Not promised in the first iOS cut.* |
| **Server-Sent Events (SSE)** | ⬜ Future — new core streaming-route model (pairs with WebSockets work) |
| **Range requests** (media seeking) | ⬜ Future — server-side `Range` handling |

These amend [adr-001](../decisions/0001-embedded-runtime.md) #4 ("deliberately minimal, no WS/SSE"):
HTTP fidelity is now *tiered*, not minimal-forever. The Bridge-vs-HTTP channel split still holds — WS/SSE
are web-standard real-time *inside the on-device server*, distinct from the native-event Bridge.

---

## Monorepo Structure (current state)

```
capsule/                            ← local monorepo
  packages/
    cli/                            ← @capsule/cli    (TypeScript, Node) ✅ Done
    core/                           ← @capsule/core   (TypeScript, web runtime) ✅ Done
    capsule-android/                ← Kotlin AAR      (Android shell) ✅ Done
      capsule/src/main/kotlin/dev/capsule/
        CapsuleActivity.kt          ← thin shell (Phase 2: delegates to CapsuleRuntime)
        CapsuleBridge.kt            ← JSON-RPC 2.0 dispatcher ✅
        handlers/                   ← 6 native API handlers ✅
        WebBridge.kt                ← browser dev fallback ✅
        runtime/                    ← Phase 2: CapsuleRuntime + CivetwebServer + RequestRouter + QuickJS
    capsule-ios/                    ← Swift XCFramework (Phase 4)
    native/civetweb/                ← vendored CivetWeb, shared by Android + iOS
    codesync-api/                   ← Fastify backend (Phase 6)
    codesync-dashboard/             ← React dashboard (Phase 6)
  examples/
    react-ts/                       ← React TypeScript example app ✅
    vue-ts/                         ← Vue TypeScript example app
    svelte-ts/                      ← Svelte TypeScript example app
    vanilla-ts/                     ← Vanilla TypeScript example app
  pnpm-workspace.yaml
  turbo.json
  package.json
  tsconfig.base.json

  # Phase 8 — Ecosystem / Go Online (added after local MVP is green):
  # docker/
  #   dev.Dockerfile
  #   build-android.Dockerfile
  #   build-web.Dockerfile
  # .devcontainer/
  #   devcontainer.json
  # .github/
  #   workflows/
  #     ci.yml
  #     release.yml
  #     docker.yml
```

---

## Shell Version Registry *(Phase 8)*

> In Phase 8 (Ecosystem), the CLI will resolve shell versions via GitHub Releases API (see `../reference/lockfile.md`):
> - Every Capsule release creates a GitHub Release tagged `vX.Y.Z`
> - Each release attaches `release.json` with AAR URL + SHA-256
>
> **Phase 1**: Use `CAPSULE_SHELL_OVERRIDE_PATH` to point the CLI at your locally built AAR — no registry needed.

---

## Docker Images *(Phase 8)*

> Docker images (`ghcr.io/capsule/*`) are built and published in Phase 8 — Ecosystem / Go Online.
> See `docker.md` for planned images. Phase 1 builds run directly on Windows 11 + WSL2.

---

## Phase 1 — Done ✅

```
[x] capsule init my-app --template react-ts  →  scaffolds a valid project
[x] capsule add android                       →  adds .capsule/android/ wrapper
[x] capsule dev                               →  Vite starts, app loads in emulator
[x] Edit src/App.tsx                          →  hot reload in <50ms
[x] capsule build android                     →  app-debug.apk exists
[x] capsule run android                       →  APK installed on Samsung device
[x] capsule build android --release           →  app-release.apk (signed with debug key)
[x] @capsule/core geolocation API             →  GPS works on device/emulator
[x] 6 native APIs (geolocation, camera, haptics, push, biometrics, alerts)
[x] WebBridge — all 6 APIs work in browser dev mode
[x] 36 TypeScript unit tests passing
[x] 24 Kotlin unit tests passing
```

## Phase 2 — Entry Criteria ✅

```
[x] All Phase 1 tests still green
[x] capsule dev android works end-to-end on real device
[x] capsule build android --release produces installable APK
[x] WebBridge tested in browser (capsule dev without --android)
```

## Phase 2 — Embedded Runtime

Key deliverables, in order:

```
Step 1: Interfaces + fakes ✅
  [x] CapsuleServer interface + FakeCapsuleServer (neverStarts, startsAfter, crashesAfter)
  [x] QuickJSEngine interface + FakeQuickJSEngine (evaluationFails, slowStart, callReturns)
  [x] SplashController interface + FakeSplashController
  [x] AppNavigator interface + FakeAppNavigator
  [x] CapsuleRuntime wired with fakes — 15 unit tests passing (pure JVM, no device)

Step 2: Embedded server for static assets ✅ (NanoHTTPD; CivetWeb since 2026-10-24)
  [x] CivetwebServer implements CapsuleServer (originally NanoHttpdServer)
  [x] Replaces file:///android_asset/www/index.html with http://127.0.0.1:{port}/
  [x] Port = deterministic hash from appId, range 49152–65535, baked into MainActivity

Step 3: Splash + readiness ✅
  [x] WebViewSplashController implements SplashController
  [x] CapsuleRuntime.start(): show splash → wait for server bind → navigate WebView
  [x] Timeout (3s default) → error screen with retry button

Step 4: QuickJS JNI embedding ✅
  [x] QuickJS-ng v0.15.1 C library in AAR via JNI (CMakeLists.txt, single-thread dispatcher)
  [x] QuickJSEngine.evaluate(bundle) and call(fn, args) working
  [x] QuickJSException sealed class (EvaluateError, CallError)
  [x] 4 instrumented tests passing

Step 5: QuickJSBridge ✅
  [x] QuickJSBridge interface + QuickJSBridgeImpl (AssetManager-backed) + FakeQuickJSBridge
  [x] @capsule/core router runs inside QuickJS — dispatch() returns plain object (not string)
  [x] routes.js bundled by esbuild IIFE into assets/www/ on capsule build
  [x] CapsuleBridge tries JS dispatch first, falls through to Kotlin handlers if null
  [x] 30 unit tests + 8 instrumented tests passing
  [x] Validated end-to-end on emulator (release build): all Kotlin handlers working,
      QuickJS bridge initialises cleanly, METHOD_NOT_FOUND for unregistered methods

Step 6: File-based routing + embedded-server /api/* routing ✅
  Sub-task A — JSON-RPC file discovery (bridge handler overrides):
  [x] src/routes/<method>.ts → export default handler(params) → auto-registered via addRoute()
  [x] CLI discovers files at build time, generates addRoute() calls bundled into server bundle
  [x] Example: src/routes/device.getInfo.ts intercepts device.getInfo before Kotlin

  Sub-task B — HTTP API routing (new /api/* endpoints):
  [x] src/server/routes/*.ts → export GET/POST/PUT/DELETE(req: CapsuleHttpRequest)
  [x] RequestRouter routes /api/* → QuickJSEngine.call("handleHttpRequest", ...) → response
  [x] CLI discovers HTTP route files, generates addHttpRoute() calls in server bundle
  [x] @capsule/core/routes exports CapsuleHttpRequest, CapsuleHttpResponse, addHttpRoute, handleHttpRequest
  [ ] Dynamic segments: users/[id].ts → /api/users/:id (deferred — exact paths only for now)

  Bundle path:
  [x] assets/server/bundle.js (server code never served as a static asset)
  [x] QuickJSBridgeImpl loads from assets/server/bundle.js; the server only serves assets/www/

  Dev-mode routes (resolved during Group 0 testing, 2026-06-12):
  [x] Release: routes run in QuickJS. Dev on-device: CapsuleBridge forwards unmatched
      JSON-RPC methods to the dev sidecar (POST devServerUrl/_capsule/rpc via adb reverse),
      so src/routes/*.ts work under `capsule dev android` too (previously METHOD_NOT_FOUND).

Group 0 end-to-end testing ✅ (2026-06-12)
  [x] All 7 from-template examples: browser-dev · emulator-dev · emulator-release
  [ ] Group 1 (custom React) + Group 2 (non-Vite proxy) + device-release — pending

Step 7: codeSync crash loop + rollback ✅ (2026-06-15)
  [x] BundleStore (two-slot active/previous) + FileBundleStore — atomic install/swap of a bundle
      dir (www/ + server/bundle.js), validates www/index.html; rollback restores previous
  [x] CrashLoopGuard — "3 crashes in 60s" detection over a persistent CrashLog (PrefsCrashLog =
      SharedPreferences, survives process death) + injectable Clock
  [x] CapsuleRuntime: on start() rolls back to previous known-good bundle when crash-looping,
      records each launch attempt, notifyAppReady() (WebView onPageFinished) confirms healthy boot
  [x] Wired into CapsuleActivity (prod path): PrefsCrashLog + FileBundleStore(filesDir/bundles)
  [x] 25 new pure-JVM unit tests (CrashLoopGuard 9 · FileBundleStore 10 · CapsuleRuntime rollback 6),
      incl. the FakeCapsuleServer.CrashesAfter(0) "three crashes → fourth launch rolls back" path.
      Full suite: 71 JVM unit tests green.
  [ ] OTA download/install (capsule codesync publish + on-device fetch) — deferred to Phase 6 (the
      crash-loop + rollback mechanism is in place; only the network delivery of bundles remains)
```

## Template extensibility (Phase 1 init + Phase 8 ecosystem) ✅ 2026-06-12

The CLI's `init` resolves templates from a **single templates repo** (subdirs per template), driven by a `manifest.json` so adding a template needs no CLI release:

```
capsule init my-app --template react-ts                  # official (manifest → templates-repo subdir)
capsule init my-app --template gh:acme/capsule-tpl#v2    # any giget source (GitHub/GitLab/Bitbucket/tarball)
capsule init my-app --template ./my-local-template       # local path
```

- Dev: reads local `templates/manifest.json` + copies the subdir.
- Prod: fetches the manifest from the templates repo (raw URL), giget pulls `gh:<repo>/<dir>#<branch>`; bundled list is the offline fallback.
- Custom templates: any source that isn't an official name is passed straight to giget (or copied if a local path). The CLI won't clobber a `capsule.config.ts` a custom template ships.

**Pending (revisit at GitHub publish):** confirm the published templates repo name/org (`TEMPLATES_REPO` in `init.ts`); company-registry config (`~/.capsulerc` adding internal templates to the picker); an "Authoring a template" doc + template contract.

## Design decisions (2026-06-12)

### Compatibility — what Capsule guarantees, and for how long
- The **frontend framework runs in the WebView**, NOT in QuickJS. QuickJS only runs server routes
  (`src/routes`, `src/server/routes`) + `@capsule/core`'s router. → **Any frontend framework, any
  version, is fine**; the only ceiling is the WebView/browser baseline (tied to `minSdk` / OS).
- The **one real compatibility surface is QuickJS** — server-route code must stay within QuickJS-ng's
  supported JS feature/API set (no Node/DOM globals).
- **The contract to freeze (not the framework):** JSON-RPC bridge protocol + `@capsule/core` API +
  pinned QuickJS-ng version. Semver + a protocol-version field.
- **Guarantees:** `capsule.lock` pins the shell per project (reproducible); publish a compat matrix
  (CLI ⇄ shell ⇄ core ⇄ QuickJS ⇄ min WebView); CI builds every template AND runs each route bundle
  in real QuickJS per release. Framework version is documented as out-of-scope for Capsule compat.

### CLI distribution & self-update
- **Prefer project-local CLI** (`@capsule/cli` devDependency, run via `pnpm capsule`) → version pinned
  per project, reproducible. Global install stays for `capsule init`.
- **No silent auto-update.** Add an **update-notifier** ("update available → npm i -g @capsule/cli@x").
- `capsule upgrade` bumps `@capsule/core` + shell in a project and rewrites `capsule.lock` (explicit).
  `capsule doctor` reports CLI/core/shell/QuickJS versions + compat.

### Adding Capsule to an existing web project — CLI-assisted (planned)
- `capsule dev/build` already wrap any bundler (`web.buildCommand`/`devCommand` + transparent proxy).
- A `capsule init` in an existing dir (or `capsule integrate`): detect bundler/framework, skip UI
  scaffold, generate `capsule.config.ts` (+ build/dev commands), add `@capsule/core`, run
  `capsule add android`. Developer only owns: static build output dir + dev/build commands.

## Next steps (re-sequenced 2026-06-15, revised)

Capability before monetization: **native APIs → iOS → OTA cloud → migration on-ramp.** The business
strategy ([business/business-model.md](business/business-model.md)) holds but is sequenced
after the platform is capable and cross-platform.

1. **Phase 3 — Native APIs Expansion** (next). Each via the proven interface + provider + Fake pattern,
   pure-JVM testable. (Realigns with [../decisions/log.md](../decisions/log.md)
   which already scopes camera/filesystem/push/db here.) **Ordering — re-sequenced 2026-06-15 to
   foundational-first** (so the table-stakes APIs that later work leans on land before the specialized
   ones):

   | # | API | Why here |
   |---|-----|----------|
   | ✅ | **Camera** | done — capturePhoto / pickImage |
   | ✅ | **Filesystem** | done — read/write/append/delete/mkdir/rmdir/readdir/stat/getUri/downloadFile; `data`/`cache`/`documents` roots kept outside `filesDir/bundles`; localStorage dev fallback; INTERNET auto-declared for downloads |
   | ✅ | **App lifecycle + deep links** | done — `app.getState`/`onStateChange`/`onResume`/`onPause` (ProcessLifecycleOwner — true app-level fg/bg, ignores in-app activity transitions) + `app.getLaunchUrl` (cold-start, consume-once) / `onUrlOpen` (warm, via `onNewIntent` + `launchMode=singleTask`); strict cold/warm split; CLI generates deep-link intent-filters from `deepLinks` config; introduced the **CapabilityRegistry** (`capsule.getCapabilities`, seeds app/camera/filesystem) for OTA gating; verified on device |
   | ✅ | **Network status** | done — `network.getStatus()` + `onStatusChange()` (no replay-on-subscribe, mirrors `app.onStateChange`); `ConnectionType = wifi\|cellular\|ethernet\|none\|unknown` with the invariant `none ⇔ !connected`; Android `ConnectivityManager.registerDefaultNetworkCallback` (NetworkRequest fallback < API 24) behind a pure-JVM `NetworkProvider` seam + de-dup `NetworkStatusController`; WebBridge maps `navigator.onLine` + online/offline events; CLI auto-declares `ACCESS_NETWORK_STATE`; registered in CapabilityRegistry (`network`=1). Introduced the **shared `BridgeEventEmitter`** (extracted from the app-lifecycle `AppEventEmitter`) reused by both event-driven controllers. OTA/push lean on it. *(device smoke + instrumented test pending — see below)* |
   | 4 | **Push (FCM/APNs)** | needs App lifecycle + deep links (✅) to route notification taps |
   | 5 | **Local notifications** | pairs with push (scheduled, no server) |
   | 6 | **Biometrics** | auth gate |
   | 7 | **Status bar · Keyboard · Share** | UI/UX table-stakes group |
   | 8 | **SQLite `db`** — ✅ built 2026-10-24 ([database.md](../guide/database.md)) | structured storage |
   | 8.5 | **`ai` inference (Tier-1 spike)** — ✅ built 2026-10-24 ([ai.md](../guide/ai.md)) | OS-native wrap (Gemini Nano/AICore; Apple Foundation Models in Phase 4) via the same interface+provider+Fake pattern — proves the bridge surface cheaply. **Tier-2 bundled (Cactus/llama.cpp) + Tier-3 cloud + the agent layer land in Phase 6.** See [adr-003](../decisions/0003-ai-and-agents.md). Every Phase-3 API above is, by then, a free agent tool. |
   | 9 | **NFC · Bluetooth** | specialized hardware |
   | 10 | **Background jobs** | WorkManager / BGTaskScheduler |
   | 11 | **Telecom · SMS** | call / messaging (later) |

   **Two cross-cutting constraints on every Phase-3 API** (driven by the Phase-5 OTA model, cheap now /
   expensive to retrofit): (a) **persist user data *outside* the OTA-swappable bundle dirs** (`www/` +
   `server/bundle.js`) so an OTA bundle swap never wipes it — camera already writes to
   `cacheDir/capsule/camera`; (b) **carry a native-capability version** so the Phase-5 OTA server can
   gate a JS update against the installed shell (avoid pushed JS calling a native API the shell predates).

   **Parked (revisit post-iOS):** *install/manage other apps* (an "app store" capability — download
   `.apk` + `PackageInstaller`, or device-owner for silent/kiosk installs). **Deliberately not scheduled:
   it's Android-only — iOS has no app-install API**, so it breaks the cross-platform seam. If pursued, it
   would be an explicit opt-in **Android-only** module built on Filesystem, kept off the core API surface.
2. **Phase 4 — iOS bring-up.** Interface-first Swift/QuickJS port mirroring the Android runtime; build +
   Simulator tests on GitHub Actions macOS (free — the repo is public; `ios-macos` job already runs `swift test`). No Mac purchase
   required yet. Plan: [ios-bring-up.md](../contributing/ios-bring-up.md).
3. **Phase 5 — Capsule UI** (native-look component layer). `capsule add-ui` (shipped) + shared
   iOS/Material Tailwind preset + per-framework behaviour — Capsule's own "Konsta". Slotted *after* iOS so
   its presets target a real WKWebView shell and native *look* is proven on both platforms; pure
   frontend/CSS, touches no native APIs. See [adr-002](../decisions/0002-capsule-ui.md).
4. **Phase 6 — Server Code Push / OTA cloud.** OTA network delivery (`capsule codesync publish` + the
   deferred half of Step 7) + portal + canary/auto-rollback + multi-tenant + billing. Infra on
   Hetzner + R2/CDN ([infrastructure.md](infrastructure.md)). Launch → repos public → free macOS CI.
   **Pulled ahead 2026-09:** the local file-based server half is done — `packages/codesync-api`
   (Fastify, E2E-verified: publish/rollback/pause/resume, ETag, key auth); remaining: the CLI
   `codesync publish` command and the on-device fetch client in `packages/core`.
   **Pairs with the AI/agents workstream** ([adr-003](../decisions/0003-ai-and-agents.md)): the
   Tier-2 on-device engine (Cactus/llama.cpp), Tier-3 cloud inference (a metered billing surface), the
   thin agent layer (**native bridge methods = agent tools**, MCP-style), and **OTA-updatable agent
   logic** all land here — the agent definitions ride Server Code Push, protected by the canary +
   auto-rollback built in Step 7. Differentiator Ionic can't match (theirs is an experimental OS-model
   shim; see adr-003's device-coverage cliff).
5. **Phase 7 — Migration on-ramp** (can overlap Phase 6 as GTM): `capsule migrate ionic` +
   `@capsule/compat-capacitor` + plugin importer. Then Phase 8 ecosystem / Phase 9 DX.

**Phase-2 regression — fix at the next code session (user-visible):**
**S1 — embedded-server bind race — ✅ resolved 2026-10-24** (found 2026-10-15): NanoHTTPD 2.3.1 returned
from `start()` before `bind()`. Fixed by replacing the server with CivetWeb on both platforms —
`mg_start2` returns only after bind + listen, so readiness holds by construction. Pinned by the
instrumented `CivetwebServerTest` and the Swift `CivetwebServerTests`. Still to run: SR-4's manual
cold-start check on emulator + device. See [2026-10-embedded-server-startup.md](incidents/2026-10-embedded-server-startup.md) → Resolution.
**S2 — the embedded server serves only `assets/www/`** (still open with CivetWeb); OTA-installed bundles
(`filesDir/bundles/active`) are never served — on-device CodeSync updates cannot apply until
the server reads the active bundle through `BundleStore` (related finding in the same doc).

**Carried-over small items** (not blocking): **Network status — instrumented `AndroidNetworkProviderTest` +
device smoke (NetworkScreen live toggle) not yet run** (offline tiers all green: core 112 vitest, CLI 9
vitest, Kotlin JVM unit suite — incl. `NetworkStatusControllerTest` + `NetworkHandlerTest` + the migrated
shared-emitter app tests); finish test matrix (Group 0/1 emulator-release + device-release, Group 2
emulator/device); exclude `assets/testing/**` from CLI vitest sweep; Angular component test; `--css
tailwind`; CLI update-notifier; confirm `TEMPLATES_REPO` at publish; **soften `BundleStore`'s
`java.io.File` signature (`activeDir(): File?`, `install(File)`) to a neutral path/URI type so it
becomes a literal cross-platform contract — flagged by the 2026-06-26 iOS contract-readiness audit
([ios-bring-up.md](../contributing/ios-bring-up.md)); every other interface is already platform-neutral;
CI docs job installs plain `mkdocs` but `mkdocs.yml` requires the material theme
(`pip install mkdocs mkdocs-material` in the workflow fixes it).**

**First dependency/tooling sweep pending** — run [upkeep.md](../contributing/upkeep.md) once (baseline is
captured, no live check done yet). Good to do at the Push #4 kick-off. Known reconciliations it
flags: library catalog ↔ CLI `sync.ts` lockstep, `minSdk` 21 (lib) vs 26 (init default), and the
template `@capsule/core` placeholder (fixed 2026-10-24: `^0.1.0`).

See `0001-embedded-runtime.md` for the full architecture rationale.
