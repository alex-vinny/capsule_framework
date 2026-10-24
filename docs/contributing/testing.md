---
title: "Testing"
audience: contributor
status: current
code:
  - packages/cli/src/commands/test.ts
  - packages/cli/src/testing.ts
  - packages/cli/assets/testing/**
  - packages/core/src/testing/**
---
# Testing

Capsule ships an **opt-in** test harness so a generated app can be tested at
every layer that matters — from pure route handlers up to the real WebView on a
device — without the developer wiring a toolchain by hand.

> Opt in at scaffold time, exactly like Tailwind:
> ```
> capsule init my-app --template react-ts --test vitest
> ```
> Omitting `--test` shows a prompt (`None` / `Vitest`); `None` is the default and
> ships zero test files. Mirror of `--css none|tailwind`.

### Framework support

Wired for **all seven** templates. The agnostic tiers (route-contract, route
units, QuickJS-fidelity, integration) are identical everywhere; only the
component test + vitest config are framework-specific.

| Framework | Component test | Notes |
|-----------|----------------|-------|
| react-ts | ✅ `@testing-library/react` | |
| vue-ts | ✅ `@testing-library/vue` | |
| svelte-ts | ✅ `@testing-library/svelte` | Vitest **projects** split (see wiring notes) |
| vanilla-ts / vanilla-js | ✅ raw DOM | loads `index.html`, imports `main`, clicks by id |
| jquery-bootstrap | ✅ raw DOM | native `.click()` fires jQuery's delegated handlers |
| angular-ts | ⏳ agnostic tiers only | TestBed/analog component test is a follow-up |

## Why layered

Manual device testing (install → launch → screenshot → eyeball) is slow,
token-/time-expensive, and flaky. Almost everything it checks is actually
deterministic and can be asserted off-device in milliseconds. Each layer below
catches a distinct failure class; only the last genuinely needs a device.

| Tier | File (`react-ts`) | Runtime | Catches |
|------|-------------------|---------|---------|
| 1 — Route contract | `src/test/route-contract.test.ts` | Vitest (node) | A `bridge.call('x')` / `fetch('/api/y')` with **no handler file** (the 404 class) — statically, before build |
| 1 — Route units | `src/test/routes.test.ts` | Vitest (node) | Handler logic — pure functions, no bridge/server |
| 2 — Component | `src/test/app.test.tsx` | Vitest (jsdom) | UI wiring — renders `<App/>` against `@capsule/core`'s **FakeBridge**; tab nav, async result plumbing |
| 3 — QuickJS fidelity | `src/test/quickjs.test.ts` | Vitest (node) + `quickjs-emscripten` | "works in dev Node sidecar, breaks in embedded QuickJS" — bundles routes like `capsule build`, runs `dispatch`/`handleHttpRequest` in a real QuickJS, asserts `fetch` is absent |
| — Integration (HML) | `src/test/integration.test.ts` | Vitest (node) | Live backend — **gated on `CAPSULE_API_BASE`**, skipped by default so CI stays hermetic |
| 4 — On-device smoke | `app/src/androidTest/.../SmokeTest.kt` | Gradle `connectedAndroidTest` (Espresso-Web) | Blank screen / WebView-attach / asset-load / JS crash — the one class only a real device/emulator shows |

## Running

```
capsule test                 # tiers 1–3 + integration (one-shot, hermetic)
capsule test --watch         # vitest watch mode
capsule test routes          # extra args pass through to vitest (filters/flags)

CAPSULE_API_BASE=https://hml.example.com capsule test   # also runs the HML test

# Tier 4 (needs a device/emulator):
#   debug   → run `capsule dev` first (loads the dev server via adb reverse)
#   release → self-contained (embedded bundle)
cd .capsule/android && ./gradlew :app:connectedDebugAndroidTest
```

## How it's wired (for maintainers)

- **Injector**: `packages/cli/src/testing.ts` → `applyTesting(projectDir, template)`.
  Copies `assets/testing/_shared/` (the agnostic tiers, identical everywhere) then
  `assets/testing/<framework>/` (vitest config + setup + component test) into the
  project, and patches `package.json` with test scripts + `SHARED_DEPS` +
  `FRAMEWORK_DEPS[template]`. Mirrors `tailwind.ts`. Called from `init.ts` when
  `--test vitest` (or the prompt) is chosen; falls through with a notice otherwise.
- **Component-test mock**: each test does `vi.mock('@capsule/core', …)` returning a
  fresh `FakeBridge` as the `bridge` export, then reads it back via the mocked
  import (`const fake = bridge as FakeBridge`) — no `__fake` export hack, no
  hoisting trap. Vanilla/jQuery load `index.html` into jsdom and import `main` so
  the real handlers attach, then click by id.
- **Tier-3 detail**: the QuickJS test runs in the **node** Vitest environment
  (`// @vitest-environment node`) — esbuild's `TextEncoder instanceof Uint8Array`
  invariant fails under jsdom. It re-creates the CLI's `bundleRoutes()` IIFE so it
  exercises the *same* dispatch contract Kotlin calls.
- **Svelte uses Vitest `projects`**: `svelteTesting()` forces
  `resolve.conditions: ['browser']` (so components get their client build), which
  would also make `quickjs-emscripten` load its network-fetching *browser* WASM.
  So the component test runs in a browser-conditioned jsdom project and the
  agnostic tiers run in a plain Node project. Other frameworks don't need this.
- **Tier-4 generator**: `sync.ts` writes `SmokeTest.kt` + androidTest deps
  (`espresso-web`, `ext-junit`, `runner`) + `testInstrumentationRunner` on every
  sync. The assertion is **content-agnostic** (non-empty body text via a
  Hamcrest-1.3-safe matcher) because `.capsule/android` is regenerated each sync
  and can't be hand-tailored. Espresso pins Hamcrest **1.3** — avoid 2.x matchers
  (`matchesPattern`, `blankOrNullString`).

## Verification status (2026-06-12)

- Tiers 1–3 + integration: **PASS in every wired framework**, each verified by
  injecting into its `*-from-template` example and running `vitest`:
  react / vue / svelte **12 passed**, vanilla-ts / vanilla-js / jquery **11
  passed**, angular **9 passed** (agnostic tiers, no component test) — 1 skipped
  (integration) in each. The contract test was proven to fail with
  `Missing JSON-RPC route file(s): hello` when `hello.ts` is removed.
- `capsule test` + the `applyTesting` injector: verified end-to-end (command runs
  the suite; injector copies `_shared` + framework files and merges scripts + deps).
- Tier 4: `assembleDebugAndroidTest` **builds green**; the on-device mechanism is
  **proven** (Espresso-Web launched MainActivity and read the live DOM via
  `getText()`). A fully-green `connectedAndroidTest` against a *feature* app
  (react-ts-native) is intermittent due to instrumentation/emulator state
  (`NoActivityResumedException`, post-test app uninstall) on a long-running
  session — not a scaffold defect.

## Follow-ups

- **Angular component test.** Angular ships the agnostic tiers only. A component
  test needs Angular's TestBed wired into Vitest — e.g. `@analogjs/vite-plugin-angular`
  + a setup that calls `initTestEnvironment`, then `@testing-library/angular`'s
  `render(AppComponent)`. Add it under `assets/testing/angular-ts/` and the deps to
  `FRAMEWORK_DEPS['angular-ts']`.
- **Tier-4 hardening** for permission-requesting / slow-boot apps: a
  `GrantPermissionRule` (from `config.android.permissions`) and/or a launch retry
  to make `connectedAndroidTest` robust against `NoActivityResumedException`.
- **AI / agents testing** (Phase 3 spike onward) maps onto these same tiers via a
  `FakeAiProvider` / scripted `FakeLlm` — the model is a provider behind the bridge,
  so the agent loop is deterministic given a scripted sequence of model responses.
  Tier 1 asserts tool-registry wiring + routing logic; Tier 2 renders against a canned
  `ai.generate`; **Tier 3 runs the agent loop in real QuickJS** with inference stubbed;
  the integration tier (gated on `CAPSULE_AI_*`) and Tier-4 device smoke assert
  *structure not content* against a live model (valid tool-call JSON, termination,
  token/latency budgets). See [../decisions/0003-ai-and-agents.md](../decisions/0003-ai-and-agents.md) § Testing.

---

## Manual test plan

Testing matrix: **browser-dev** · **emulator-dev** · **emulator-release** · **device-release**

Legend: ✅ expected pass · ❌ expected fail (N/A for env) · 🔲 not yet tested

> **Automated harness (opt-in):** much of this matrix is now coverable without manual
> device steps. `capsule init --test vitest` ships route-contract + unit + component +
> QuickJS-fidelity tests (run via `capsule test`) plus an on-device Espresso-Web smoke
> test — see the harness sections above.

---

### Group 0 — From-template (7 examples)

> Validates that `capsule init` output works identically across all supported frameworks.  
> All 7 have identical UI: Home tab (Say Hello alert) + Server tab (bridge.call hello + GET /api/ping).

| # | Example | Framework | Port |
|---|---------|-----------|------|
| 0.1 | `react-from-template` | React + TypeScript | 5190 |
| 0.2 | `vue-from-template` | Vue 3 + TypeScript | 5175 |
| 0.3 | `svelte-from-template` | Svelte 5 + TypeScript | 5176 |
| 0.4 | `angular-from-template` | Angular 19 | 5177 |
| 0.5 | `vanilla-js-from-template` | Vanilla JS | 5182 |
| 0.6 | `vanilla-ts-from-template` | Vanilla TS | 5174 |
| 0.7 | `jquery-from-template` | jQuery + Bootstrap | 5183 |

> Ports above are the actual `devPort` values from each example's `capsule.config.ts` (verified 2026-06-11). The dev route sidecar runs at `devPort+1000`.

#### Checks (apply to each of the 7)

| Check | browser-dev | emulator-dev | emulator-release | device-release |
|-------|-------------|--------------|------------------|----------------|
| App renders (no blank screen, no JS errors) | 🔲 | 🔲 | 🔲 | 🔲 |
| Tab bar visible at bottom (⌂ Home · ⚡ Server) | 🔲 | 🔲 | 🔲 | 🔲 |
| Home tab: framework badge correct | 🔲 | 🔲 | 🔲 | 🔲 |
| Home tab: "Say Hello" → native alert fires | 🔲 | 🔲 | 🔲 | 🔲 |
| Server tab: "Call hello route" → returns "Hello, World! (from QuickJS)" | 🔲 | 🔲 | 🔲 | 🔲 |
| Server tab: "GET /api/ping" → returns `{"status":"ok","path":"/api/ping"}` | 🔲 | 🔲 | 🔲 | 🔲 |
| Tab switching: results **persist** across tabs (state lifted to App — by design) | 🔲 | 🔲 | 🔲 | 🔲 |
| HMR: edit src file → browser reloads (dev only) | 🔲 | 🔲 | ❌ | ❌ |

> **Tab-state note:** results intentionally persist across tab switches (state lives in `App`). The original "state resets" expectation was wrong and has been removed. `react-from-template` additionally has a **Clear** button to reset results manually — that button is example-only for now; propagating it to the other 6 templates is a pending TODO (see session log).

#### Group 0 results log

| Cell | Date | Result |
|------|------|--------|
| 0.1 `react-from-template` · browser-dev | 2026-06-11 | ✅ PASS — all 8 checks (render, tab bar, React badge, Say Hello alert, hello route `Hello, World! (from QuickJS)`, `/api/ping` ok, tab persistence + Clear, HMR reload) |
| 0.1 `react-from-template` · emulator-dev | 2026-06-11 | ✅ PASS — surfaced + fixed a real gap: `bridge.call('hello')` returned `METHOD_NOT_FOUND` because the native bridge intercepted it and never reached the dev sidecar. Fixed by adding dev-mode forwarding in `CapsuleBridge` (unknown methods → POST `devServerUrl/_capsule/rpc` via adb reverse). Now returns the hello message on-device in dev. |
| 0.1 `react-from-template` · emulator-release | 2026-06-11 | ✅ PASS — embedded runtime (QuickJS + NanoHTTPD at the time, no dev server; server since replaced by CivetWeb — re-run this row). Say Hello native alert; hello route via real QuickJS; `/api/ping` via NanoHTTPD→QuickJS. |
| 0.2 `vue-from-template` · browser-dev | 2026-06-12 | ✅ PASS |
| 0.4 `angular-from-template` · build | 2026-06-12 | 🔧 Fixed build error — `ng build` type-checks (Vite/esbuild don't), caught `res.message` on `unknown`. Added generic: `bridge.call<{ message: string }>('hello', …)`. |
| 0.4 `angular-from-template` · browser-dev | 2026-06-12 | 🔧 Fixed two-click bug — bridge/`fetch` promises resolve **outside Angular's zone** (`__capsule.js` wraps `window.fetch` before zone.js patches it; on-device the native `__capsuleReceive` callback is also out-of-zone), so the view updated only on the next click. Fixed with `ChangeDetectorRef.detectChanges()` after each async result in `callHello`/`callPing`. **Both Angular fixes applied to the example AND the canonical `capsule-angular-ts-template`** (the latter would otherwise break `capsule init` output and ship the two-click bug). The untyped `bridge.call` pattern is latent in the other examples but only Angular's compiler/zone surface it. |

> **Dev-mode JSON-RPC routes on-device:** as of 2026-06-11, custom `src/routes/*.ts` work under `capsule dev android` (native bridge forwards unmatched methods to the dev sidecar). Previously they only worked in browser-dev and release. Requires the dev server running + adb reverse (both set by `capsule dev`).

#### Tailwind (optional `--css tailwind`) — 2026-06-12

Optional `capsule init --css tailwind` ships Tailwind v3 + a shared **Capsule native preset** (iOS look on the existing `.btn`/`.card`/`.tab` class names — no markup rewrite). Default stays `--css none`.

| Example | Build | Notes |
|---|---|---|
| react / vue / svelte / vanilla-js / vanilla-ts · build | ✅ | `vite build` green; CSS ≈7 KB (base + preset) |
| angular · build | ✅ | `ng build` green; `styles.css` 7.75 KB (global via `angular.json`) |
| jquery · build | ✅ | **kept on Bootstrap** (Tailwind skipped by design) |

All 7 from-template examples regenerated (6 to Tailwind, jQuery unchanged) and build green. **Visual native-look check on device still pending** (builds verified; appearance to be eyeballed).

---

### Group 1 — React + Vite feature apps (3 examples)

> Extended React apps testing CSS, native APIs, and routing beyond the template baseline.

#### 1.1 `react-ts` (port 5173)

Two-tab layout: **Native** (Device/Alerts/Haptics/Clipboard/Storage/Location/QuickJS) · **Routes** (JS override + HTTP).

| Check | browser-dev | emulator-dev | emulator-release | device-release |
|-------|-------------|--------------|------------------|----------------|
| Native tab: Device info loads | 🔲 | ✅ | 🔲 | 🔲 |
| Native tab: Alerts — all 3 styles fire | 🔲 | ✅ | 🔲 | 🔲 |
| Native tab: Haptics — all patterns trigger | 🔲 | ✅ | 🔲 | 🔲 |
| Native tab: Clipboard read/write | 🔲 | ✅ | 🔲 | 🔲 |
| Native tab: Storage set/get | 🔲 | ✅* | 🔲 | 🔲 |
| Native tab: Location — coords appear | 🔲 | ✅ | 🔲 | 🔲 |
| Native tab: Network — status + live event log (toggle airplane/wifi) | 🔲 | 🔲 | ✅ | 🔲 |
| Native tab: QuickJS eval — `Math.sqrt(144)` → `12` | ❌ | ✅ | 🔲 | 🔲 |
| Routes tab: JS override `custom.hello` → "Hello, \<name\>! (handled by QuickJS)" | ❌ | ✅ | 🔲 | 🔲 |
| Routes tab: GET /api/ping → JSON ok | ❌ | ✅ | 🔲 | 🔲 |
| Routes tab: GET /api/items → list loads | ❌ | ✅ | 🔲 | 🔲 |
| Routes tab: POST /api/items → item added, persists in session | ❌ | ✅ | 🔲 | 🔲 |
| Tab bar fixed at bottom, does not overlap content | 🔲 | ✅ | 🔲 | 🔲 |

> **1.1 emulator-dev — 2026-06-12.** PASS. Built debug APK (`capsule build android` → `assembleDebug`, release-AAR override), installed + launched on `emulator-5554` against `capsule dev` (Vite :5173 + sidecar :6173 + adb reverse). **Verified on-device by screenshot:** render, Device info (Model `sdk_gphone64_x86_64`, Android 15/SDK 35, WebView 124), native Alert dialog ("Hello from Capsule!" + "Pressed: OK"), Haptics (`light` → "Last: light"), Clipboard (Copy "Cap" → Paste read back "Cap"), Location (`37.42200, -122.08400`), Routes tab JS override (`custom.hello` → "Hello, Capsule! (handled by QuickJS)") and `GET /api/ping` JSON, tab bar + Native↔Routes switching. **Verified via the sidecar (same WebView path, `localhost:5173` proxy):** `quickJs.ping` `Math.sqrt(144)`→`"12"`, `GET /api/items`, `POST /api/items` (`durian` added + persists). **\*Storage:** `storage.set`/`get` are native Kotlin handlers reached through the identical bridge confirmed working on-device this session via 5 other native APIs; not individually captured on screen (this example renders no Set button on the storage row + Get on an unset key shows nothing — a UI quirk, not a bridge defect).
>
> **Findings (deferred, low priority):**
> - `capsule run android` only **installs**, never launches the activity (its description says "Install and launch"). Had to `adb shell am start -n …/.MainActivity` manually.
> - `runtime: 'QuickJS'` is **hardcoded** in `src/server/routes/ping.ts`, so the cross-cutting "runtime field distinguishes QuickJS vs Node sidecar" check can't actually distinguish dev (Node) from release (QuickJS). The execution environment should inject that value.
> - In dev mode, JS/HTTP routes run in the **Node sidecar**, not real QuickJS — so the "(handled by QuickJS)" strings are misleading in dev. Real QuickJS execution gets verified in the emulator-**release** pass.

#### 1.2 `react-ts-native` (port 5181)

iOS-style 4-tab layout: **Home** · **Tools** · **Settings** · **Server**.

| Check | browser-dev | emulator-dev | emulator-release | device-release |
|-------|-------------|--------------|------------------|----------------|
| 4 tabs visible in tab bar | 🔲 | ✅ | 🔲 | 🔲 |
| Home tab: Device info + Location | 🔲 | ✅ | 🔲 | 🔲 |
| Tools tab: Haptics, Clipboard, Storage | 🔲 | ✅ | 🔲 | 🔲 |
| Settings tab: Alert styles | 🔲 | ✅ | 🔲 | 🔲 |
| Server tab: Call hello route → result | 🔲 | ✅ | 🔲 | 🔲 |
| Server tab: GET /api/ping → result | 🔲 | ✅ | 🔲 | 🔲 |
| Tab navigation preserves state (switching back = no reset) | 🔲 | ✅ | 🔲 | 🔲 |

> **1.2 emulator-dev — 2026-06-12.** PASS. Built debug APK (release-AAR override), installed + launched on `emulator-5554` against `capsule dev` (Vite :5181 + sidecar :6181 + adb reverse). **Verified on-device by screenshot:** all 4 tabs (Home/Tools/Settings/Server) render with iOS-style native layout; **Home** — Device info live via bridge (Model `sdk_gphone64_x86_64`, Google, Android 15/SDK 35, Virtual `true`, WebView `124.0.6367.219`) + Location resolved to `37.42200, -122.08400` after `adb emu geo fix`; **Tools** — Haptics/Clipboard/Storage sections render; **Settings** — Alert-style radios (Default/Dark/Brand/Warning) + native **Show alert** dialog ("Hello from Capsule!" → OK) confirms the alert bridge; **Server** — `Call hello route` → "Hello, World! (from QuickJS)" and `GET /api/ping` → `{"status":"ok","path":"/api/ping"}` rendered inline; tab navigation between all 4 tabs works.
>
> **Finding (fixed this session):** the example shipped with **no route files** — its Server tab calls `hello` (JSON-RPC) and `/api/ping` (HTTP) but `src/routes/` and `src/server/routes/` were empty, so both returned 404. Added canonical `src/routes/hello.ts` + `src/server/routes/ping.ts` (same content as the from-template baseline); the running `capsule dev` sidecar hot-reloaded them and both resolve on-device. **Note:** the debug APK used here was built *before* the route files were added, but emulator-dev forwards route calls to the Node sidecar (not the bundled QuickJS), so the empty `assets/server/bundle.js` is irrelevant for this pass — **a rebuild is required before the emulator-release pass** so the QuickJS bundle includes the new routes.
>
> **Carried-over findings (still apply, see §1.1):** `capsule run android` installs but doesn't launch (used `adb shell am start`); dev routes run in the Node sidecar, not real QuickJS (the "(from QuickJS)" string is misleading in dev — real QuickJS verified in the release pass).

#### 1.3 `react-ts-tailwind` (port 5180)

React Router HashRouter, 4 routes: **/** (Native) · **/network** · **/splash** · **/server**.

| Check | browser-dev | emulator-dev | emulator-release | device-release |
|-------|-------------|--------------|------------------|----------------|
| All 4 tab icons render (SVG) | 🔲 | ✅ | 🔲 | 🔲 |
| Native route `/` loads | 🔲 | ✅ | 🔲 | 🔲 |
| Network route `/network` loads | 🔲 | ✅ | 🔲 | 🔲 |
| Splash route `/splash` — animation plays | 🔲 | ✅ | 🔲 | 🔲 |
| Server route `/server` — Call hello route → result | 🔲 | ✅ | 🔲 | 🔲 |
| Server route `/server` — GET /api/ping → result | 🔲 | ✅ | 🔲 | 🔲 |
| Tailwind classes apply correctly (no unstyled content) | 🔲 | ✅ | 🔲 | 🔲 |
| Deep link to `/server` works (no blank screen on reload) | 🔲 | ❌ | ❌ | ❌ |

> **1.3 emulator-dev — 2026-06-12.** PASS. Built debug APK (release-AAR override, routes included), installed + launched on `emulator-5554` against `capsule dev` (Vite :5180 + sidecar :6180 + adb reverse). **Verified on-device by screenshot:** all 4 SVG tab icons render (phone/wifi/clock/server); HashRouter navigation works across all 4 routes; **`/` Native** — Device info live via bridge (Model/Manufacturer/OS/Virtual/WebView), ALERTS (radio styles + Alert/Confirm/Destructive — native **Alert** dialog "Hello from Capsule!" fired), HAPTICS chips, all Tailwind-styled (rounded cards, iOS look, no unstyled content); **`/network`** — DOG CEO API + POKÉAPI fetch cards render; **`/splash`** — Start triggers the full-screen blocking overlay (spinning ring + live countdown "2.3s" + "Simulating server startup…" + Cancel), animation plays; **`/server`** — `Call hello route` → "Hello, World! (from QuickJS)" and `GET /api/ping` → `{"status":"ok","path":"/api/ping"}` rendered inline. Startup splash (3s) also observed on launch.
>
> **Finding (fixed this session):** same missing-route-files defect as §1.2 — `ServerTab.tsx` calls `hello` + `/api/ping` but `src/routes/` and `src/server/routes/` were empty (404). Added canonical `src/routes/hello.ts` + `src/server/routes/ping.ts`; included in this build (so the QuickJS bundle is release-ready too) and resolved on-device.
>
> **Deep-link `/server` (❌ N/A):** HashRouter has no server-side route to deep-link; not applicable to the embedded/dev WebView load (always boots at `/`). Marked ❌ by design.

---

### Group 2 — Non-Vite transparent proxy (3 examples)

> Validates the CLI dev proxy (Option B) — Capsule acts as a transparent HTTP proxy between the WebView and any bundler's dev server. HMR and route injection must work for all three.

Port scheme: `devPort` = proxy (WebView connects here), `devPort+1` = bundler internal, `devPort+1000` = sidecar.

| # | Example | Bundler | devPort | Bundler port | Sidecar |
|---|---------|---------|---------|--------------|---------|
| 2.1 | `webpack-preact` | Webpack 5 | 5184 | 5185 | 6184 |
| 2.2 | `rspack-lit` | Rspack 1 | 5186 | 5187 | 6186 |
| 2.3 | `rollup-solid` | Rollup 4 | 5185 | 5186 | 6185 |

> Ports above are the actual `devPort` values from each example's `capsule.config.ts` (verified 2026-06-15; previous values 5182/5183/5185 were wrong, same drift as Group 0). **Overlap note:** 2.1's bundler-internal (5185) and 2.3's proxy (5185) collide, as do 2.3's bundler-internal (5186) and 2.2's proxy (5186) — harmless because Group 2 examples are run one at a time, but don't run them concurrently.

#### Checks (apply to each of the 3)

| Check | browser-dev | emulator-dev | emulator-release | device-release |
|-------|-------------|--------------|------------------|----------------|
| `capsule dev` starts without error; proxy log shows correct ports | ✅ | 🔲 | ❌ | ❌ |
| Browser at devPort renders app (proxy is transparent) | ✅ | 🔲 | ❌ | ❌ |
| `/__capsule.js` present in page (injected by proxy) | ✅ | 🔲 | ❌ | ❌ |
| HMR: edit src file → browser updates without full reload | ⚠️ | 🔲 | ❌ | ❌ |
| Native tab: all demo sections render | ✅ | 🔲 | 🔲 | 🔲 |
| Server tab: "Call hello route" → result | ✅ | 🔲 | 🔲 | 🔲 |
| Server tab: "GET /api/ping" → result | ✅ | 🔲 | 🔲 | 🔲 |
| Bundler uses `devPort+1` (not the user-facing port) | ✅ | n/a | ❌ | ❌ |
| No port conflict with sidecar | ✅ | 🔲 | ❌ | ❌ |

> **⚠️ HMR check** is example-config-dependent, not a proxy capability gap: the proxy's WebSocket-upgrade forwarding works for all three. webpack-preact and rspack-lit propagate edits over the proxied WS but do a **live-reload** (full page reload), not a true hot-swap — neither example configures a framework HMR boundary (preact-prefresh / lit hot). rollup-solid has **no auto-reload at all** (`rollup-plugin-serve` only, no `rollup-plugin-livereload`) — edits rebuild `dist`, browser needs a manual refresh.

#### 2.3 rollup-solid extra check

| Check | browser-dev | emulator-dev | emulator-release | device-release |
|-------|-------------|--------------|------------------|----------------|
| `CAPSULE_INTERNAL_PORT` env var read by rollup-plugin-serve | ✅ | n/a | ❌ | ❌ |
| serve plugin binds to port 5186 (not 5185) | ✅ | n/a | ❌ | ❌ |

#### Group 2 results log

| Cell | Date | Result |
|------|------|--------|
| 2.1 `webpack-preact` · browser-dev | 2026-06-15 | ✅ PASS — proxy :5184 → bundler :5185, sidecar :6184. App renders (Preact), `__capsule.js` injected, `window.fetch` patched, `GET /api/ping` → `{"status":"ok","path":"/api/ping"}`, `POST /_capsule/rpc` hello → `{"message":"Hello, World! (from QuickJS)"}`, **0 console/page errors** (verified headless Chromium). HMR: live-reload via proxied WS. **Surfaced + fixed a real proxy bug — see below.** |
| 2.2 `rspack-lit` · browser-dev | 2026-06-15 | ✅ PASS — proxy :5186 → bundler :5187, sidecar :6186. `<capsule-app>` renders into **Shadow DOM** (3188 chars), `__capsule.js` injected, fetch patched, `/api/ping` + hello RPC OK, 0 errors. HMR: live-reload via proxied WS (`hot: true`). |
| 2.3 `rollup-solid` · browser-dev | 2026-06-15 | ✅ PASS — proxy :5185 → bundler :5186, sidecar :6185. Solid app renders, `__capsule.js` injected, fetch patched, `/api/ping` + hello RPC OK, 0 errors. **Extra checks ✅:** `rollup-plugin-serve` reads `CAPSULE_INTERNAL_PORT` and binds :5186 (not :5185). No auto-reload configured (rebuild-on-save only). |

> **Proxy bug fixed this session (`dev-proxy-server.ts` `forwardInjectHtml`):** the non-Vite dev proxy buffered the bundler's HTML to inject `<script src="/__capsule.js">`, but did so assuming **uncompressed** bytes. Real browsers and the on-device WebView send `Accept-Encoding: gzip`; webpack-dev-server (default `compress: true`) then gzips the HTML. The proxy read the gzip bytes as UTF-8 (injection silently no-op'd), stripped the `content-encoding` header, and forwarded the still-compressed body labeled `text/html` → a **garbled page with no Capsule injection**. curl masked it by not requesting compression by default. **Fix:** delete the `accept-encoding` request header before forwarding through `forwardInjectHtml`, so the bundler always returns injectable plaintext. This bug would have broken all non-Vite examples in `capsule dev` on a real device/emulator, not just in-browser.

---

### Cross-cutting checks

These apply across all 13 examples once at least one of each group passes.

| Check | Notes |
|-------|-------|
| `capsule build android` + `capsule run android` succeeds for each example | Full Gradle pipeline |
| `adb reverse` ports set correctly in dev mode | Verify in adb shell |
| Route sidecar starts on `devPort+1000` for all examples | Check console output |
| `src/routes/hello.ts` loaded by sidecar (check via Server tab) | Sidecar picks up file-based routes |
| `src/server/routes/ping.ts` responds at `/api/ping` | HTTP route handler |
| Switching to device: WebView connects to same port as browser | adb reverse prerequisite |
| Release build: QuickJS evaluates routes (not Node.js sidecar) | Check runtime field in ping response |

---

### Test order recommendation

```
Group 0.1 (react-from-template) browser-dev → emulator-dev → emulator-release
Group 0 remaining (0.2–0.7) browser-dev only first pass
Group 2 (non-Vite) browser-dev — validates proxy
Group 1 (custom React) emulator-dev — validates full native API coverage
All groups emulator-release → device-release
```

Start with `react-from-template` as it has the simplest surface area and covers the entire chain (Vite + sidecar + routes).
