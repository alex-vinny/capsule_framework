# AGENTS.md — packages/capsule-android (Android shell)

Parent: [`../../AGENTS.md`](../../AGENTS.md). Layout and build: [`README.md`](README.md).

The Gradle library module `capsule/` that builds the AAR every Capsule app links: a WebView host,
the JSON-RPC bridge, one handler + provider per native API, CivetWeb (embedded server) and QuickJS
(on-device `/api` routes) over JNI.

## Entry files

- `capsule/src/main/kotlin/dev/capsule/CapsuleActivity.kt` — composition root: registers capabilities
  and builds the handler list.
- `.../<api>/` — `XxxProvider.kt` (interface + `CAPABILITY`/`CAPABILITY_VERSION`) and
  `AndroidXxxProvider.kt`; `.../handlers/<api>/XxxHandler.kt` — JSON dispatch over the provider.
- `.../runtime/` — `CivetwebServer`, `RequestRouter`, `StaticAssets`, the QuickJS bridge, bundle
  store, crash-loop guard.
- `capsule/src/main/cpp/` — `CMakeLists.txt`, `capsule_server_jni.c`, `quickjs_jni.c`; the C it
  compiles comes from `../native/`.
- `gradle/libs.versions.toml` — every version; the CLI generates app projects from it.

## Test

```sh
pnpm verify:android                 # assembleDebug + testDebugUnitTest (pure JVM), env from .env.local
pnpm with-env --cwd packages/capsule-android gradlew connectedDebugAndroidTest   # device/emulator tier
```

## Local rules

- **Handler tests run on the plain JVM:** test the handler against a fake from
  `capsule/src/test/kotlin/dev/capsule/fakes/`; Android-framework code stays in `AndroidXxxProvider`
  and is covered by the instrumented tier (`src/androidTest/`).
- **QuickJS JNI:** `globalThis` is the only reliable store between calls, and `dispatch()` returns
  objects, never JSON strings (the C helper would double-encode them) — `docs/concepts/primers/quickjs.md`.
- **Embedded server:** binds `127.0.0.1` only; `stop()` never blocks (a worker may be waiting on the
  main thread); JNI ids are resolved once in `nativeStart`; keep rules for JNI-called classes live in
  `capsule/consumer-rules.pro`.
- **Stale AAR:** after any Kotlin/C/Gradle change, rebuild the AAR (`assembleRelease`) before
  building an app against it.
- A new runtime dependency must also be added to the app dependencies `capsule sync` generates
  (local AARs don't carry them) — see `packages/cli/AGENTS.md`.

## Docs

`docs/decisions/0001-embedded-runtime.md` · `docs/decisions/0004-web-serving-transport.md` ·
`docs/contributing/testing.md` · `docs/concepts/primers/{quickjs,civetweb,jni-and-cpp}.md`.
