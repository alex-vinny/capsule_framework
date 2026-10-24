# Capsule iOS

iOS native shell for the Capsule Framework — a SwiftPM package that builds with **xtool**
(the cross-platform Xcode replacement) on macOS **and Linux/Windows (Docker)**, no Mac required.

## Structure

The package manifest lives at the **capsule repo root** (`../../Package.swift`), not here: SwiftPM
only resolves a package from a git URL when `Package.swift` is at the root, and a target may only
use sources under the package root — the `CCivetweb` target compiles `packages/native/civetweb`,
which the Android build shares. Sources and tests stay in this folder:

```
Package.swift                       (repo root) targets: CCivetweb, Capsule, CapsuleTests;
                                    deps: swift-crypto + ZIPFoundation
packages/native/civetweb/           vendored CivetWeb (C) — the embedded HTTP server, shared with Android
packages/capsule-ios/
  Sources/dev/capsule/
    CapsuleShellConfig.swift        shell + CodeSync config (ports CapsuleShellConfig.kt)
    CapsuleViewController.swift     composition root (UIKit — platform edge, placeholder)
    CapsuleBridge.swift             JSON-RPC 2.0 dispatcher (WebKit — platform edge, placeholder)
    WebBridge.swift                 browser dev fallback (Foundation)
    handlers/CameraHandler.swift    camera API (UIKit — platform edge, placeholder)
    runtime/
      CapsuleRuntime.swift          coordinator — platform-neutral via `Bridging` protocol
      CapsuleServer.swift           embedded-server protocol + `ServerStartupError` (mirrors Kotlin)
      CivetwebServer.swift          `CapsuleServer` on CivetWeb: loopback-only, ready on return
      RequestRouter.swift           what each request gets: /api/* → handler, else static asset
      StaticAssets.swift            asset-source protocol + `DirectoryStaticAssets` (bundle www/)
      Clock.swift                   `Clock` protocol + SystemClock (fake in tests)
      CrashLog.swift                `CrashLog` protocol + UserDefaultsCrashLog
      CrashLoopGuard.swift          pure logic — 3 crashes / 60 s → rollback (ported + tested)
      BundleStore.swift             two-slot store protocol (active/previous) — URL-based
      FileBundleStore.swift         filesystem implementation (ported + tested)
    sqlite/
      DbProvider.swift              `db` provider protocol + wire types (mirrors Kotlin DbProvider)
      SqliteDbProvider.swift        SQLite3 C API implementation (`#if canImport(SQLite3)` — Apple only)
      DbHandler.swift               JSON `db.*` dispatch over the provider (Linux-tested with a fake)
    ai/
      AiProvider.swift              `ai` provider protocol, `TieredAiProvider`, `UnavailableAiProvider`
      AppleFoundationModelsProvider.swift  Tier 1 on iOS 26+ (`#if canImport(FoundationModels)`)
    codesync/
      CodeSyncManager.swift         OTA client: check → rollout → download → verify →
                                    extract → install (full flow, injected deps, tested)
      CodeSyncModels.swift          wire types (mirror @capsule/core + Android models)
      CodeSyncHTTPClient.swift      transport protocol + URLSession impl
      CodeSyncPreferences.swift     persistence protocol + UserDefaults impl
      Murmur3.swift                 MurmurHash3 x86_32 — pure Swift, TS-vector-pinned
      Rollout.swift                 deterministic rollout cohort (matches TS + Android)
      CodeSyncUnzipper.swift        ZIP extraction with zip-slip protection
  Tests/CapsuleTests/
    Fakes.swift                     one fake per protocol (mirrors dev.capsule.fakes)
    runtime/                        CrashLoopGuardTests (9), FileBundleStoreTests (10),
                                    RequestRouterTests (10), CivetwebServerTests (7, real sockets)
    codesync/                       Murmur3Tests (9), CodeSyncModelsTests (6),
                                    CodeSyncUnzipperTests (5), CodeSyncManagerTests (13)
    sqlite/                         DbHandlerTests (9), SqliteDbProviderTests (10, Apple only)
    ai/                             TieredAiProviderTests (11)
  drafts/                           unbuilt Phase-4 sketches (QuickJS bridge, Swift interfaces) —
                                    not compiled; replaced file by file as the real code lands
```

## Testing discipline (mirrors the Android implementation)

Every side-effecting dependency is an **injected protocol with a Fake**: `Clock`, `CrashLog`,
`BundleStore`, `CodeSyncHTTPClient`, `CodeSyncPreferences`, `Bridging`, `StaticAssets`. Pure logic
(`CrashLoopGuard`, `Murmur3`, `Rollout`, wire decoding, `RequestRouter`) is separated from platform
glue and pinned by unit suites. The **murmur3 vectors are shared with Android's `RolloutTest`** —
both were generated from the TypeScript reference (`murmurhash3js-revisited`), so all three
implementations are provably identical on the same inputs. `RequestRouterTests` and
`CivetwebServerTests` mirror Android's `RequestRouterTest` and `CivetwebServerTest` case for case.

Platform-edge files (UIKit/WebKit) are wrapped in `#if canImport(UIKit)` / `#if canImport(WebKit)`,
so the platform-neutral core — including the CivetWeb server, which is plain C — compiles and its
tests run **on Linux**. That is how this package is tested without Apple hardware (below).

## Building & testing

### Anywhere (Docker) — the full pure-core + flow test suite

Run from the **capsule repo root** (where `Package.swift` is):

```sh
# macOS / Linux / Git Bash
docker run --rm -v "$(pwd):/workspace" -w /workspace swift:6.4-jammy \
  swift test --scratch-path /tmp/build
```

```powershell
# Windows PowerShell
docker run --rm -v "${PWD}:/workspace" -w /workspace swift:6.4-jammy `
  swift test --scratch-path /tmp/build
```

This runs all 89 tests that build on Linux (the 10 SQLite provider tests need Apple's SQLite3 module and run on macOS). `--scratch-path /tmp/build` keeps the Linux build products inside the
container instead of writing a `.build/` folder into your checkout. (Git Bash on Windows rewrites
`/workspace`-style paths — prefix the command with `MSYS_NO_PATHCONV=1`.) What it does **not**
cover: UIKit/WebKit code (compiled out on Linux) — that is exercised on CI macOS and by the xtool
build below.

### macOS / CI — device build with xtool

```bash
xtool auth login          # once; Apple Developer Services
xtool sdk install iphoneos
xtool build -c release    # from the capsule repo root
```

The resulting framework is consumed by the Capsule CLI via `CAPSULE_SHELL_OVERRIDE_PATH`
(iOS artifact: `.xcframework`). See `docs/contributing/ios-bring-up.md` for the bring-up plan.

## Status

- **Done**: SwiftPM layout, runtime seams, CodeSync client core (check/rollout/download/verify/
  extract/install), the embedded server (`CivetwebServer` + `RequestRouter`, readiness contract
  pinned by real-socket tests), 89 unit tests green on Linux, shared murmur3 vectors.
- **Placeholder (Phase 4)**: WKWebView shell, bridge dispatch, wiring the server into
  `CapsuleRuntime`/`CapsuleViewController`, QuickJS engine glue.

See the Android package (`packages/capsule-android/`) for the reference architecture this
mirrors, and `docs/contributing/platform-parity.md` for the parity contract.
