# AGENTS.md — packages/capsule-ios (iOS shell)

Parent: [`../../AGENTS.md`](../../AGENTS.md). Structure: [`README.md`](README.md).

The Swift port of the Android shell. The SwiftPM manifest is the repo-root `Package.swift`
(targets `CCivetweb`, `Capsule`, `CapsuleTests`); sources and tests live here. iOS follows Android:
each type mirrors its Kotlin counterpart and keeps the same wire contract.

## Entry files

- `Sources/dev/capsule/runtime/` — `CapsuleRuntime`, `CivetwebServer`, `RequestRouter`,
  `StaticAssets`, bundle store, crash-loop guard.
- `Sources/dev/capsule/{sqlite,ai,codesync,handlers}/` — native APIs (provider protocol + handler).
- `Sources/dev/capsule/CapsuleViewController.swift`, `CapsuleBridge.swift` — the UIKit/WebKit edge.
- `Tests/CapsuleTests/` — XCTest suites; `Fakes.swift` holds the shared fakes.
- `drafts/` — not compiled (the Phase-4 QuickJS bridge sketch).

## Test

```sh
pnpm verify:ios     # swift test in the swift:6.4-jammy container — no Mac needed
```

CI also runs `swift test` on macOS, the only place Apple-only code compiles.

## Local rules

- **Linux-first:** platform-neutral logic must build and pass on Linux. Code that needs an Apple
  framework sits behind `#if canImport(UIKit)` / `canImport(WebKit)` / `canImport(SQLite3)` /
  `canImport(FoundationModels)`, with the logic it drives behind a protocol tested with a fake.
- Keep a fake alive for the whole test (hold it in a local): some fakes delete their files on release.
- Same native-API shape as Android: protocol + fake + provider + handler test + capability version.
- The C server is `packages/native/civetweb` — its defines in `Package.swift` must match Android's
  `CMakeLists.txt`.

## Docs

`docs/contributing/ios-bring-up.md` · `docs/contributing/platform-parity.md` ·
`docs/decisions/0004-web-serving-transport.md`.
