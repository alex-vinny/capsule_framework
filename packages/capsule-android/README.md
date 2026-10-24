# capsule-android — the Android native shell

The generated native shell apps embed: Kotlin + C/C++ (CMake/NDK) hosting
**CivetWeb + QuickJS** as the on-device runtime, compiled to a
`capsule-release.aar` consumed by app projects.

## Layout

| Path | What |
|---|---|
| `capsule/` | the Gradle library module (builds the AAR) |
| `capsule/src/main/kotlin/dev/capsule/` | bridge, handlers (incl. `handlers/`), controllers, `storage/` |
| `capsule/src/main/cpp/` (CMake) | QuickJS/native side — `.cxx/`, `CMakeFiles/` etc. are build caches (gitignored) |
| `capsule/build/` | Gradle build output + `outputs/aar/capsule-release.aar` (gitignored) |

## Build & test

```bash
cd packages/capsule-android
./gradlew assembleRelease     # → capsule/build/outputs/aar/capsule-release.aar
./gradlew test                # JVM unit suite
./gradlew connectedDebugAndroidTest   # instrumented tier (needs a device/emulator)
```

`gradlew.bat` is the Windows wrapper; `./gradlew` on POSIX. Machine env comes from the
repo-root `.env.local` (copy `.env.example`): `pnpm with-env --cwd packages/capsule-android gradlew <task>`
runs Gradle with JAVA_HOME and the SDK paths set; `pnpm verify:android` builds and runs the JVM tests.

## Docs

Runtime ADR: [`docs/decisions/0001-embedded-runtime.md`](../../docs/decisions/0001-embedded-runtime.md).
Testing tiers: [`docs/contributing/testing.md`](../../docs/contributing/testing.md).
CI: [`docs/contributing/ci.md`](../../docs/contributing/ci.md).
