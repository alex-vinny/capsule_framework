---
title: "Capsule vs Ionic/Capacitor"
audience: everyone
status: current
---
# Capsule vs Ionic/Capacitor — Architectural Comparison

> Capacitor (Ionic's native runtime) is the right benchmark — it's the architectural equivalent of Capsule.

---

## Where Capsule is currently superior

### 1. Generated native project — no committed `android/` or `ios/`

Capacitor requires you to commit the full `android/` and `ios/` directories (thousands of files). Capsule generates `.capsule/android/` from `capsule.config.ts` via `capsule sync`. You `.gitignore` it entirely.

This is the same philosophy as Nuxt's `.nuxt/` — your project repo is clean. No Android Studio merge conflicts. No accidental Gradle version drift.

### 2. `capsule.lock` — native dependency versioning

Capacitor has no lock file concept for the native shell. You don't know which version of the native runtime your project was built against unless you check Gradle files manually.

Capsule tracks `aarHash` (content hash of the native shell) and `configHash` in `capsule.lock`. You commit this file. `--frozen-lockfile` fails fast in CI if someone changed the config without syncing.

### 3. Bundler-agnostic by design

Capacitor is heavily Vite-oriented. Their official docs and tooling assume Vite.

Capsule has `web.buildCommand` / `web.devCommand` as first-class config. Angular with `ng build`, Rspack, Rollup, Webpack — they all just work by setting two strings. The examples directory proves this: `rollup-solid`, `rspack-lit`, `webpack-preact` all coexist.

### 4. OTA updates and background jobs designed in from day 1

Capacitor's OTA update story is **Appflow** — a paid external service. It's not in the framework.

Capsule has `codeSync` and `jobs[]` as first-class schema fields (Phase 2, but the architecture is designed for them). Background jobs with constraints (`network: 'unmetered'`, `battery: 'charging'`), sync strategies (`merge` vs `replace`), scheduled notifications — all part of the config schema. No third-party service required.

### 5. No Ionic vs. Capacitor split

Ionic is a UI component library. Capacitor is the native runtime. They're separate products that happen to be made by the same company. You can use Capacitor without Ionic, but the docs and mental model constantly blur the line.

Capsule is one thing: a framework. One CLI, one core package, one config file.

### 6. Testable native layer by design

Capacitor plugins are notoriously hard to unit test — they depend on Android/iOS context. Capsule's provider pattern (`AlertsProvider`, `StorageProvider`, etc.) decouples the API definition from the Android implementation. Every handler has a fake provider, every handler has isolated unit tests in pure Kotlin/JUnit. No emulator needed for the tests.

### 7. Template system with real framework support

Capacitor's `ionic start` heavily pushes Ionic UI components. For vanilla React, Vue, Svelte, or Angular without Ionic components, you're essentially on your own.

Capsule has 7 framework-native templates (vanilla-js, vanilla-ts, react-ts, vue-ts, svelte-ts, angular-ts, jquery-bootstrap) via giget — designed to become separate repos, independently maintained, zero lock-in to Capsule's UI opinions.

---

## Where Capsule is not yet superior (honest)

| Area | Capacitor | Capsule |
|---|---|---|
| iOS | Mature | Not implemented (Phase 4) |
| Plugin ecosystem | 200+ plugins (camera, biometrics, push, etc.) | 6 built-in APIs |
| Production-tested | Thousands of apps | 0 production apps |
| Community | Large | None yet |

(The old "web serving scheme" weakness is **closed**: Capsule replaced `file:///android_asset/www/`
with an embedded loopback HTTP server in Phase 2 — see below.)

---

## Web serving architecture decision

> **Decided — embedded loopback HTTP server on both platforms.** See
> [adr-004](../decisions/0004-web-serving-transport.md) for the full rationale, and
> [../contributing/platform-parity.md](../contributing/platform-parity.md) for the parity map.
> `WKURLSchemeHandler` and `https://localhost` were considered and **rejected** (no WebSocket
> support / cross-platform asymmetry / cert-trust burden respectively).

| Mode | Android | iOS |
|---|---|---|
| **Dev** | Vite dev server at `http://192.168.x.x:PORT` via `adb reverse` | Same |
| **Production** | **CivetWeb** → `http://127.0.0.1:{port}/` | **CivetWeb** (the same C server) → `http://127.0.0.1:{port}/` |

This gives both platforms full `http://` semantics: `localStorage`, `IndexedDB`, service workers,
and CORS all behave correctly — and keeps `/api` route behaviour **identical** across platforms.
Unlike Capacitor (custom `capacitor://` scheme on iOS), Capsule runs a real server on both sides,
so on-device `/api` routes get full HTTP fidelity (streaming now; WebSockets/SSE on the roadmap).
