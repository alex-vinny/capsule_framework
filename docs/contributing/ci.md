---
title: "CI"
audience: contributor
status: current
code:
  - .github/workflows/**
  - scripts/verify.mjs
---
# CI — GitHub Actions

> The framework's continuous build + test: `.github/workflows/ci.yml` (the docs site deploys from
> `.github/workflows/docs.yml`). The repo is public, so GitHub-hosted Linux **and macOS** runners are
> free — every layer that doesn't need a real device runs here, Android and iOS alike.

---

## What runs

Triggered on pushes to `main`, on every pull request, and manually (**Run workflow**).

| Job | Runner | What it checks |
|---|---|---|
| **`js`** | `ubuntu-latest` | `pnpm install --frozen-lockfile` → `format:check` → `lint` → `build` → `typecheck` → `test` → `test:scripts` → `docs:check` → generated-reference freshness (`node scripts/gen/index.mjs --check`); `docs:lint` runs as advisory (`continue-on-error`) |
| **`android`** | `ubuntu-latest` + JDK 17 + Android SDK/NDK | `./gradlew assembleDebug testDebugUnitTest` — the AAR builds (CivetWeb + QuickJS through CMake) and the pure-JVM unit tests pass; reports uploaded on failure |
| **`android-instrumented`** | `ubuntu-latest`, KVM, API-35 emulator | `./gradlew connectedDebugAndroidTest` — the instrumented suite (QuickJS, `CivetwebServerTest`, `AndroidDbProviderTest`, `AndroidGeminiNanoProviderTest`, …). **Opt-in** (see below); runs after `android` |
| **`ios-linux`** | `swift:6.4-jammy` container | `swift test` — the same run contributors do locally in Docker |
| **`ios-macos`** | `macos-latest` | `swift test` on macOS — adds the Apple-only suites (e.g. `SqliteDbProviderTests` over the system SQLite3) |

The `ndk` version installed in CI is pinned in `ci.yml` (`NDK_VERSION`) and must match `ndkVersion`
in `packages/capsule-android/capsule/build.gradle.kts`.

### The opt-in instrumented run

Emulator runs are slow, so `android-instrumented` only runs when asked:

- **Manually:** Actions → CI → **Run workflow** → tick **instrumented**.
- **On a pull request:** add the label **`instrumented`**.

**Not covered anywhere in CI:** camera `capturePhoto` / `pickImage` are interactive (system camera,
photo picker) and stay a manual on-device pass, alongside the real-device e2e tier.

---

## Running the same checks locally

| Command (repo root) | Same as |
|---|---|
| `pnpm verify` | the `js` job (`--keep-going` reports every failure instead of stopping at the first) |
| `pnpm verify:android` | the `android` job (uses the JDK/SDK from your `.env.local`) |
| `pnpm verify:ios` | the `ios-linux` job (Docker, `swift:6.4-jammy`) |
| `pnpm with-env --cwd packages/capsule-android gradlew connectedDebugAndroidTest` | `android-instrumented` (start an emulator first: `pnpm dev:emulator start`) |

`pnpm verify` green is the definition of done for a change ([CONTRIBUTING](https://github.com/alex-vinny/capsule_framework/blob/main/CONTRIBUTING.md)).

---

## Test-tier alignment

Mirrors the tier strategy that holds on both platforms ([ios-bring-up.md](ios-bring-up.md)):

| Tier | Android | iOS |
|---|---|---|
| unit | vitest + Gradle `testDebugUnitTest` — every push | `swift test` on Linux + macOS — every push |
| integration | `connectedDebugAndroidTest` on the emulator (opt-in) | Simulator tests (with the WKWebView shell, Phase 4) |
| e2e | real device — manual | real iPhone — manual |
