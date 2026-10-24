---
title: "Workflow: add a native API"
audience: contributor
status: current
---
# CONTEXT — add-native-api (stage contract)

Add a new native capability to `@capsule/core` end-to-end. **Interface-first**: the TS
interface and the Android + (eventual) iOS implementations must all satisfy one contract.
Area index: `../CONTEXT.md`.

## Inputs (load these first)

| Source | Why |
|--------|-----|
| `../../../reference/core-api.md` | The `@capsule/core` API spec + error-code ranges. |
| `../../../concepts/principles.md` | Interface-first + fakes-mandatory rule. |
| `../../../concepts/architecture.md` | Bridge protocol (JSON-RPC envelope), handler registration. |
| `../../testing.md` | Which test tiers apply. |
| An existing API as the template | Mirror it. Core: `packages/core/src/` (e.g. `clipboard.ts`, `haptics.ts`). Android: `packages/capsule-android/capsule/src/main/kotlin/dev/capsule/` (handler + provider). iOS: `packages/capsule-ios/Sources/dev/capsule/`. Demo: `examples/react-ts/src/features/`. |

## Process (ordered)

1. **TS interface** → `capsule/packages/core/src/<api>.ts` — methods call `bridge.call('<api>.method', …)`; include a web fallback. Add error codes to `errors.ts` if a new range is needed.
2. **Kotlin provider (seam)** → `…/dev/capsule/<api>/<Api>Provider.kt` interface + `Android<Api>Provider` impl (so it's fakeable).
3. **Kotlin handler** → `…/dev/capsule/handlers/<api>/…Handler.kt` implements `BridgeHandler`, delegates to the provider.
4. **Register** the handler in `…/dev/capsule/CapsuleBridge.kt` (`init` block).
5. **Demo screen** → `examples/react-ts/src/features/<Api>Screen.tsx`, wired into the feature-screen registry + `ui.tsx`. (Never demo in `react-ts-native`.)
6. **Unit tests** → TS in `core/src/__tests__/<api>.test.ts`; Kotlin in `capsule-android/…/src/test/…HandlerTest.kt` (provider faked).
7. **AUDIT — run offline tiers** (`../../commands.md` §9): `pnpm test` + `gradlew test` must pass. Format gate before any commit.
8. **Rebuild AAR** (stale-AAR rule) → `gradlew assembleRelease` after the Kotlin change.

## Outputs

`core/src/<api>.ts` (+ test, + `errors.ts`), the Kotlin provider + handler (+ test) + bridge
registration, the `react-ts` demo screen, the rebuilt AAR. Update `../../../reference/core-api.md`
if the public contract changed.

## Checkpoints (human)

- **Device/emulator smoke test → hand to the user** (don't run device builds yourself): app
  loads, the demo screen calls each method, correct result + graceful errors.
- iOS parity is required by the contract even when implemented later — leave the Swift seam
  defined so the interface is satisfiable.
