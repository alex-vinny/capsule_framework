---
title: "Dependency and tooling upkeep"
audience: maintainer
status: current
code:
  - scripts/upkeep/**
  - packages/cli/src/platform/**
  - scripts/update-civetweb.mjs
  - scripts/update-quickjs.mjs
  - scripts/gen/android-toolchain.mjs
  - renovate.json
tests:
  - scripts/upkeep/**/*.test.mjs
  - packages/cli/src/__tests__/requirements.test.ts
  - packages/cli/src/__tests__/store-check.test.ts
  - packages/cli/src/__tests__/android-toolchain.test.ts
---
# Dependency & Tooling Upkeep

> How Capsule keeps every pinned dependency, toolchain and store requirement current — what is
> automated, what a person decides, and how a bump is applied. The version numbers below are the
> **baseline after the last sweep**; the live state always comes from `pnpm upkeep`, never from
> this page.

---

## The tools

| Tool | What it does | When it runs |
|---|---|---|
| **`pnpm upkeep`** (`scripts/upkeep/`) | One report, 🔴/🟡/🟢/⚪ per row: store rules, Android platform + NDK, Gradle/AGP/Kotlin, every Gradle library, the vendored C (CivetWeb, QuickJS + their security advisories), SwiftPM packages + Xcode/Swift + the Docker image, and Node (`pnpm outdated` + `pnpm audit`). | On demand; weekly in CI |
| **Upkeep workflow** (`.github/workflows/upkeep.yml`) | Runs the report weekly and keeps one open **"Upkeep report"** issue up to date. | Mondays + manual dispatch |
| **Renovate** (`renovate.json`) | Opens the dependency PRs, grouped (Android toolchain, AndroidX, kotlinx, Node dev tooling, examples monthly), and a dependency dashboard. | Weekly |
| **`requirements.json`** (`packages/cli/src/platform/`) | The curated Google Play / App Store rules, each with its effective date and source URL. Drives the report, `capsule doctor` and `capsule build`. | Updated by hand, when the report says a watched page changed |
| **`capsule doctor`** | For app developers: checks their `capsule.config.ts` against the rules bundled in their CLI, and warns when those rules are over 120 days old. `--strict` exits non-zero on a violation (for CI). | Users run it |

`pnpm upkeep` options: `--only <section,…>` (store, android-platform, android-toolchain,
android-libraries, vendored, swift, node) · `--examples` (also report the `examples/` workspace —
run `pnpm install` there first) · `--markdown` / `--json` · `--strict` (exit 1 on any 🔴) ·
`--offline`. Status: 🔴 security advisory or violated store rule · 🟡 behind, or a rule due within
90 days · 🟢 current · ⚪ source unavailable (the run never fails on one source).

## Where versions live — one source each

| What | Source of truth | Copies (generated or checked) |
|---|---|---|
| Android toolchain + libraries (AGP, Kotlin, Gradle, compileSdk, minSdk, NDK, AndroidX, …) | `packages/capsule-android/gradle/libs.versions.toml`, `gradle/wrapper/gradle-wrapper.properties`, `capsule/build.gradle.kts` | `packages/cli/src/platform/android-toolchain.ts` — **generated** by `pnpm gen` (`scripts/gen/android-toolchain.mjs`); `capsule sync` / `capsule init` read it, so generated apps follow the library. `gen:check` fails CI when it is stale. |
| Store rules | `packages/cli/src/platform/requirements.json` | — |
| Vendored C | `packages/native/{civetweb,quickjs}/VERSION` | — (re-vendor with the update scripts) |
| Swift packages | `Package.swift` (ranges) + `Package.resolved` | — |
| Swift toolchain image | `swift:X.Y-jammy` in `.github/workflows/ci.yml` and `scripts/verify.mjs` | Renovate tracks both |
| Node | each `package.json` + `pnpm-lock.yaml`; transitive fixes in the root `pnpm.overrides` | — |
| Templates (separate repo) | `capsule-templates/*/package.json` | — |

When the AAR gains a runtime dependency, add it to `APP_LIBRARIES` in `packages/cli/src/sync/sync.ts`
too — a local AAR does not carry its dependencies into the app.

## Baseline (after the 2026-10-24 sweep)

### Native & Android

| Component | Pinned | Note |
|---|---|---|
| compileSdk / app targetSdk default | **36** / **36** | Google Play requires 36 for new apps and updates since 2026-08-31. |
| minSdk | 26 | Lowest API with native notification channels. Play never gates `minSdk`. |
| AGP / Gradle | 8.13.2 / 8.14.6 | Stays on AGP 8: 9.x is a DSL migration (built-in Kotlin) — plan it with compileSdk 37. |
| Kotlin | 2.3.21 | Held on 2.3: AGP 8.13's R8 reads Kotlin metadata only up to 2.3 (2.4 needs R8 9.1.29 = AGP 9.1) — `pnpm upkeep` flags it 🔴. `kotlinOptions {}` is gone since 2.2 — builds use `kotlin { compilerOptions { … } }`. |
| NDK / CMake | 27.3.13750724 (r27 LTS) / 3.22.1 | |
| AndroidX | core-ktx 1.18.0 · appcompat 1.8.0 · lifecycle 2.11.0 · exifinterface 1.4.2 | core-ktx **held below 1.19**: 1.19 needs compileSdk 37 + AGP 9.1. |
| kotlinx | coroutines 1.11.0 · serialization 1.12.0 | |
| Others | play-services-location 21.4.0 · guava 33.7.2-android · ML Kit genai-prompt 1.0.0-beta4 · okhttp 4.12.0 | okhttp **held on 4.x** (5.x is a rewrite). |
| Test | runner 1.7.0 · ext-junit 1.3.0 · espresso-web 3.7.0 · junit 4.13.2 | |
| QuickJS-ng | **0.17.0** | Was 0.15.1, which had two high-severity advisories (fixed in 0.16.0). |
| CivetWeb | v1.16 | Still the latest release; no advisories against it. |

### iOS

| Component | Pinned | Note |
|---|---|---|
| swift-tools-version / iOS target | 5.9 / iOS 13 (macOS 10.15) | iOS 13 is the App Store floor since 2026-09-09. |
| swift-crypto | 5.0.3 (range `2.0.0..<6.0.0`) | 5.x needs Swift ≥ 6.2 (Xcode 26 — the App Store minimum anyway). |
| ZIPFoundation | 0.9.20 | |
| Linux test image | `swift:6.4-jammy` | Matches Xcode 27's Swift 6.4. |
| App Store | Xcode ≥ 26 / iOS SDK ≥ 26 since 2026-04-28 | Not pinned in the repo — `capsule doctor` checks the local Xcode on macOS. |

### Node

| Package | Notable pins |
|---|---|
| root (dev) | eslint ^10.13 · prettier ^3.9 · turbo ^2.11 · typescript-eslint ^8.72 · typescript ~5.9.3 |
| `@capsule/cli` | esbuild ^0.28.2 · giget ^3.3 · vite ^6.4.5 · commander ^15 · ora ^9.4 · js-yaml ^4.3.2 · execa ^9.6 · chalk ^5.6 — **requires Node ≥ 22.12** (commander 15) |
| `@capsule/core` | no runtime deps; dev: vitest ^4.1.12 · happy-dom ^21 · tsup ^9 · typedoc ~0.28 |
| `@capsule/codesync-api` | fastify ^5.12.7 · @fastify/multipart ^10.1.6 (zod removed — unused) |

**Holds:** vite 8 (the dev server loads the app's own Vite config/plugins; templates are on
Vite 6) · TypeScript 7 (the native port) · vitest 5, js-yaml 5, execa 10, chalk 6 (majors days to
weeks old) · `@types/node` 26 (we target Node 22).

**`pnpm.overrides`** (root `package.json`, reason in its `"//"` notes): brace-expansion, nanoid,
postcss, source-map-js, fast-uri — each forces a fixed version of a transitive dependency. Drop an
entry once `pnpm upkeep --only node` shows the parent already pulls a fixed version.

**Examples and templates** (`examples/`, and the separate `capsule-templates` repo) are their own
installs, so the root audit does not cover them — `pnpm upkeep --examples`, or `pnpm audit` in
`examples/` and in each template folder. 2026-10-24: Angular 19 (out of support, no patched 19.x) →
**Angular 22, zoneless, TypeScript ~6.0** (`@angular/build` 22 peers on `>=6.0 <6.1`); `@rspack/cli`
→ 2; vite floor `^6.4.5`; every Vite template and example declares `"type": "module"` (current
`@sveltejs/vite-plugin-svelte` 5.x is ESM-only). The examples' `pnpm.overrides` scopes
`@angular/build>vite` to `^8.3.3` (it pins 8.3.0). Examples 45 advisories → 2 moderate, both
dev-time only and accepted: `uuid` 8 under webpack-dev-server's `sockjs`, and
`postcss-selector-parser` 6 under Tailwind 3's `postcss-nested` (forcing either a major breaks its
parent). Templates: 0.

## Sweep procedure

1. `pnpm upkeep` (plus `--examples` after `cd examples && pnpm install`). Read the 🔴 first.
2. **Store rules** — a 🟡 "page changed since last review" row: read the page, update
   `requirements.json` and its `reviewed` date, then `pnpm upkeep --accept-watch <id|all>`.
3. **Decide per row**: bump now, bump with its group, or hold. A hold gets a reason in
   `scripts/upkeep/knowledge.mjs` (`HOLDS`) so the report explains it next time.
4. **Couplings** are in `scripts/upkeep/knowledge.mjs` (AGP → minimum Gradle, API level →
   minimum AGP). Re-check them against
   [about-agp](https://developer.android.com/build/releases/about-agp) and refresh its `checked`
   date when you bump the toolchain. AndroidX AARs state their own floor: unzip
   `META-INF/com/android/build/gradle/aar-metadata.properties` (`minCompileSdk`,
   `minAndroidGradlePluginVersion`).
5. Apply the bump (next section), run the tests, log the sweep below.

## How to apply a bump

- **Android** — edit the source files above, then `pnpm gen` (regenerates
  `android-toolchain.ts`) and commit both. Renovate cannot run the generator, so on a Renovate
  toolchain PR run `pnpm gen` on the branch before it can pass CI.
- **Vendored C** — `pnpm update:quickjs <tag>` / `pnpm update:civetweb <tag>` (release tags only).
  Renovate PRs for `packages/native/*/VERSION` wait for dashboard approval because a `VERSION`-only
  change is wrong: run the update script on the branch.
- **Swift** — widen the range in `Package.swift` if needed, then
  `swift package update` in the container (`pnpm verify:ios` runs the tests).
- **Node** — bump the range, `pnpm install`, then the green bar.
- **Tests** — `pnpm verify`, `pnpm verify:android`, `pnpm verify:ios`; a QuickJS, CivetWeb, NDK
  or AGP bump also needs the instrumented tests (`connectedDebugAndroidTest`) and a device smoke
  run, because the JVM tier cannot see native or packaging regressions. After any Android change,
  rebuild the AAR (`assembleRelease`) before `capsule build android`.
- Commit as `chore(deps): …` / `build: …`.

## Cadence

- Weekly: the workflow refreshes the report; skim the issue for 🔴.
- Quarterly: a full sweep (this page's procedure).
- At every phase kick-off and before any release.
- Immediately on a 🔴 (an advisory in shipped code, or a store rule taking effect).

---

## Sweep log

| Date | By | Areas swept | 🔴/🟡 found | Action taken |
|------|----|-------------|------------|--------------|
| 2026-06-23 | — | — | baseline captured (no live check yet) | doc created; first sweep pending |
| 2026-06-24 | Claude + maintainer | **ALL areas** — native, Android toolchain, AndroidX, CLI deps, core deps, templates | 1 🔴 advisory (dev-only) · ~20 🟡 | First live sweep. minSdk aligned → 26. **No bumps applied** (Push started on current tooling). Findings below. |
| 2026-10-24 | Claude + maintainer | **ALL areas**, first run of `pnpm upkeep` | 🔴: Play `targetSdk` 36 in force (extension to 2026-11-01) · QuickJS 0.15.1 with 2 high advisories · 87 npm advisories | targetSdk/compileSdk → 36 on AGP 8.13.2 / Gradle 8.14.6 / Kotlin 2.3.21 (2.4 first, rolled back after R8 warnings on the emulator run); AndroidX, kotlinx, ML Kit beta4 and test libs bumped; QuickJS → 0.17.0; swift-crypto → 5.0.3, Swift image → 6.4; Node: npm advisories 87 → 0 (fastify 5, giget 3, vitest 4, …); examples 45 → 2 (moderate, accepted) and templates → 0 (Angular 22 zoneless, rspack 2). Holds listed above. |

### Sweep 2026-06-24 — findings detail

> First live sweep. Verdict: **no forced action today.** No live Play `targetSdk` deadline, no
> 🔴 in any shipped runtime artifact. The single advisory is **dev-only with trusted input**. Everything
> else is voluntary catch-up — deferred so Push (Phase 3 #4) starts on stable tooling.

**🔴 / security**
- **happy-dom** `^14` (core *dev* dep, used only in `web-bridge.test.ts`) — **CVE-2025-61927 / GHSA-37j7-fg3j-429f**, VM-context-escape RCE, fixed in **20.0.0**. Practical risk ≈ none: dev-only, runs *our own* trusted bridge code, never attacker JS. **Action: bump to ≥20 when we next touch the test toolchain** (pairs with the Vitest 2→4 jump, which also stops auto-installing the DOM env). Not an emergency.
- **esbuild** CORS advisory **GHSA-67mh-4wv8-2f99** — affects ≤0.24.2, **already fixed by our `^0.25.0` pin**. No action.
- **NanoHTTPD** 2.3.1 — CVE-2022-21230 (local temp-file perms, `AV:L`) + CVE-2020-13697 (XSS in `RouterNanoHTTPD`, which we don't use). Localhost-only binding ⇒ risk **LOW**. Remains the strategic watch-item; right fix is replacing the embedded server, best timed with Phase 6 OTA (touches the serving path). One follow-up: confirm no class extends `RouterNanoHTTPD`.

**🟢 already current**
- **QuickJS-ng 0.15.1** (latest, 2026-06-04) · **play-services-location 21.3.0** · **junit 4.13.2** (frozen final) · **prompts 2.4.2** · **qrcode-terminal 0.12.0** · framework majors still current: **React 19** (no 20), **Vue 3.5** (no 4), **Svelte 5** (no 6) · all `@testing-library/*` within pinned majors.

**🟡 behind, no forced action (latest stable as of sweep — re-verify next sweep, do not treat as pinned):**

| Area | Component | Pin | Latest | Note |
|------|-----------|-----|--------|------|
| Toolchain | AGP | 8.7.0 | **9.2.0** | Major 8→9; needs Gradle ≥9.4.1, JDK 17 ok. Deliberate migration. |
| Toolchain | Gradle | 8.9 | **9.6.0** | Required if taking AGP 9.x. |
| Toolchain | Kotlin | 2.0.0 | **2.4.0** | Verify serialization-plugin / KSP parity on bump. |
| Toolchain | NDK | 27.2.x (r27) | **r27d LTS** (29 exists) | Safest in-place move = r27d. |
| Toolchain | compileSdk/targetSdk | 35 | **36** (Android 16) | Play still only requires 35; API-36 deadline not yet published (expect ~Aug 2026). |
| AndroidX | core-ktx | 1.15.0 | **1.19.0** | ⚠️ 1.18+ baselines to **compileSdk 36** — this bump pulls compileSdk 36. |
| AndroidX | appcompat | 1.7.0 | **1.7.1** | patch. |
| AndroidX | lifecycle-process | 2.8.7 | **2.11.0** | non-Compose artifact unaffected by 2.11's API-37 Compose requirement. |
| AndroidX | exifinterface | 1.3.7 | **1.4.2** | JPEG-marker parsing robustness. |
| Kotlinx | coroutines | 1.8.1 | **1.11.0** | gate on Kotlin version. |
| Kotlinx | serialization-json | 1.7.3 | **1.11.0** | independent of compiler plugin. |
| Test | runner / ext-junit / espresso-web | 1.6.2 / 1.2.1 / 3.6.1 | **1.7.0 / 1.3.0 / 3.7.0** | bump as a set. |
| CLI | vite | ^6 | **8.1.0** | 2 majors (Rolldown default in 8). |
| CLI | commander | ^12 | **15.0.0** | v15 ESM-only, Node ≥22.12. |
| CLI | vitest (+core) | ^2 | **4.1.9** | breaking config/API; pair w/ happy-dom bump. |
| CLI | esbuild | ^0.25.0 | **0.28.1** | output-fidelity sensitive — diff a bundle on bump. |
| CLI | giget | ^1.2 | **3.3.0** | v3 zero-dep; verify fetch API. |
| CLI | ora | ^8 | **9.4.1** | major. |
| CLI | js-yaml | ^4.1 | 5.1.0 | ⚠️ 5.x published 1 day ago — **hold at 4.x** until soaked. |
| Core/tpl | typescript | `*` / `~5.8` | **6.0.3** (5.9.3 latest 5.x) | `*` pin will silently grab breaking 6.0 — **pin down to `~5.9`**. |
| Templates | Angular | ^19 | **22.x** | 3 majors; `ng update` per major. |
| Templates | jQuery | ^3.7 | **4.0.0** | breaking; `^3.7` won't auto-take. |
| Templates | @vitejs/plugin-react · plugin-vue · vite-plugin-svelte | ^4 / ^5 / ^5 | **6 / 6 / 7** | move together with Vite. |
| Templates | zone.js | ^0.15 | 0.16.2 | minor. |
| Test harness | jsdom | ^25 | **29.1.1** | 4 majors. |
| Test harness | quickjs-emscripten | ^0.31 | 0.32.0 | pre-1.0 minor. |

**Decisions / reconciliations this sweep**
1. **#1 ↔ #2 lockstep** — verified: `libs.versions.toml` and `sync.ts`/`init.ts` agree on AGP 8.7.0, Kotlin 2.0.0, Gradle 8.9, NanoHTTPD 2.3.1, and all shared pins. **No action.**
2. **minSdk 21 vs 26** — **resolved → 26.** Library `build.gradle.kts` raised 21→26 to match the app default; unblocks channel-native Push with no pre-26 fork. (`minSdk` is never Play-gated.) **Verification folded into the Push Slice 1 AAR rebuild** (next task already runs `assembleRelease` + all tiers).
3. **Template `@capsule/core` range** — **fixed 2026-10-24: templates ask for `^0.1.0`.** It was `^1.0.0` against the real 0.1.0. Still open: the policy preference: **CLI rewrites the pin at `init` time** from the installed/published version (decouples templates from core's version permanently). Revisit when we publish to npmjs.org.

**Pin-down recommended even while deferring bumps:** `typescript` is pinned `*` in core + templates and will silently pull the breaking **TS 6.0** — tighten to `~5.9` next time these files are touched.
