---
title: "Commands"
audience: contributor
status: current
code:
  - package.json
  - scripts/*.mjs
---
# Capsule — Command Reference

Every command runs from the **capsule repo root** and works the same on Windows, macOS and Linux:
machine-specific paths live in a git-ignored `.env.local`, and the contributor scripts in
`scripts/` (exposed as `pnpm dev:*` / `pnpm update:*`) resolve the right executables per OS.
The example apps live in `examples/` (override with
`CAPSULE_EXAMPLES_DIR` in `.env.local`).

---

## 0. Session startup (always run first)

```sh
cp .env.example .env.local      # first time on a machine — then set JAVA_HOME, ANDROID_HOME, …
pnpm dev:env                    # show the effective JDK / SDK / AAR paths + adb version
adb devices                     # expect your device or emulator
```

What `.env.local` fixes:

- `JAVA_HOME` — pinned per machine; it wins over a stale value a version manager left in the shell.
- `CAPSULE_SHELL_OVERRIDE_PATH` — the local AAR the CLI builds apps against until the Maven AAR
  is published. Defaults to `packages/capsule-android/capsule/build/outputs/aar/capsule-release.aar`.

Every key and its default is documented in `.env.example`. Two ways to use it:

```sh
pnpm with-env <command> [args]                  # one command with the env applied (simplest)
eval "$(pnpm -s dev:env --sh)"                  # bash/zsh: apply to the current shell
pnpm -s dev:env --ps | Out-String | Invoke-Expression   # PowerShell: apply to the current session
```

---

## 1. TypeScript — @capsule/core

```sh
pnpm --filter @capsule/core run build           # compile TS → dist/ (after any change in packages/core/src/)
pnpm --filter @capsule/core run test            # Vitest
pnpm --filter @capsule/core run test -- --watch # watch mode
```

### Lint + format

```sh
pnpm run lint          # ESLint across all packages
pnpm run format        # Prettier --write  "packages/*/src/**/*.ts"  (rewrites in place)
pnpm run format:check  # Prettier --check — fails if anything is unformatted (CI / pre-commit gate)
```

> **Run `pnpm format` before every commit.** Prettier config (`.prettierrc`): no semicolons,
> single quotes, ES5 trailing commas, width 100, 2-space indent. The `format` script only globs
> the capsule monorepo's `packages/*/src/**/*.ts` — `.tsx` and the `examples`/`templates` repos are
> not covered by it. See [§9 Before committing](#9-before-committing-pre-commit-checklist).

---

## 2. Android — Kotlin AAR

`pnpm with-env --cwd <dir> gradlew …` runs the Gradle wrapper in `<dir>` (`gradlew.bat` on
Windows) with `JAVA_HOME` applied.

```sh
pnpm with-env --cwd packages/capsule-android gradlew assembleRelease     # build the AAR
pnpm with-env --cwd packages/capsule-android gradlew testDebugUnitTest   # Kotlin JVM unit tests
pnpm with-env --cwd packages/capsule-android gradlew connectedDebugAndroidTest   # device/emulator tests
```

AAR output: `packages/capsule-android/capsule/build/outputs/aar/capsule-release.aar`. Rebuild it
any time Kotlin or native source in `packages/capsule-android/` (or `packages/native/`) changes.

### Emulator

```sh
pnpm dev:emulator start          # launch the AVD detached, wait for a FULL boot (boot_completed + pm)
pnpm dev:emulator start --fresh  # cold boot + wipe — recovers a wedged snapshot
pnpm dev:emulator status         # readiness signals
pnpm dev:emulator stop           # graceful shutdown (keeps the snapshot)
```

Other flags: `--no-wait`, `--headless`, `--gpu host` (default is software rendering,
`swiftshader_indirect`: host-GPU mode hangs at boot on GPUs without working Vulkan/OpenGL),
`--avd <name>` (default `AVD_NAME`, `CapsuleTest`).

**Create the AVD (one time):**

```sh
pnpm with-env avdmanager create avd -n CapsuleTest -k "system-images;android-36;google_apis_playstore;x86_64" -d "Nexus 5"
```

(`with-env` finds `avdmanager`, `adb` and `emulator` under `ANDROID_HOME`. Set `ANDROID_AVD_HOME`
in `.env.local` first if your AVDs live off the default disk.)

---

## 3. CLI — @capsule/cli

```sh
pnpm --filter @capsule/cli run build
pnpm --filter @capsule/cli run test       # Vitest (scoped to src/**/*.test.ts)
pnpm capsule <command>                    # run the built CLI from the repo root
```

The CLI is not globally linked. From inside an example app, call the built entry point:
`node ../../packages/cli/dist/index.js <command>`.

---

## 4. Example apps (examples/react-ts, etc.)

### First-time setup

```sh
pnpm dev:examples install --filter react-ts   # or: cd examples/react-ts && pnpm install
```

### Build Android APK + install on device

**Release build — embedded server (no dev server needed):**

```sh
# from the capsule repo root
pnpm with-env --cwd examples/react-ts node ../../packages/cli/dist/index.js build android --release
pnpm with-env --cwd examples/react-ts node ../../packages/cli/dist/index.js run android --release
```

(Or apply the env to your shell once — §0 — then, inside the example dir, call
`node ../../packages/cli/dist/index.js …` directly. The rest of this section does that.)

`build android --release` runs `assembleRelease` → `BuildConfig.DEBUG = false` →
`devServerUrl = null` → the app uses the embedded server (CivetWeb) + bundled assets. Use this to
test the full embedded runtime (QuickJSBridge, routes.js, etc.).

**Debug build — dev server (requires `capsule dev android` after install):**

```sh
node ../../packages/cli/dist/index.js build android
node ../../packages/cli/dist/index.js run android
```

`build android` runs `assembleDebug` → `BuildConfig.DEBUG = true` →
`devServerUrl = http://localhost:5173/` → the app tries to reach Vite. Follow with
`capsule dev android` or you get `ERR_CONNECTION_REFUSED`.

### Start dev server on device (do this after every install)

```sh
node ../../packages/cli/dist/index.js dev android
```

This does two things automatically:
1. `adb reverse tcp:<devPort> tcp:<devPort>` — tunnels the device's localhost to your machine
2. Starts the Vite dev server on the configured port

**Use `capsule dev android`, not `pnpm run dev`.** `pnpm run dev` alone starts Vite but skips the
`adb reverse` step, so the device's WebView cannot reach your machine (`ERR_CONNECTION_REFUSED`).

After `capsule dev android` is running, any file change in `src/` hot-reloads on the device — no
reinstall needed. When `src/server/routes/` exists, it also starts the server-bundle sidecar and
forwards that port too.

### All examples at once

```sh
pnpm dev:examples install              # every app under examples/
pnpm dev:examples build --release      # needs the CLI built (pnpm build)
pnpm dev:examples test                 # `pnpm test` per app; apps without a test script are skipped
pnpm dev:examples all --release        # install → build → test, with a pass/fail/skip summary
pnpm dev:examples build --filter react # only dirs whose name contains "react"
```

---

## 5. Full rebuild from scratch

When switching branches or after significant Kotlin + TS changes, in this order:

```sh
pnpm with-env --cwd packages/capsule-android gradlew assembleRelease   # 1. AAR
pnpm build                                                            # 2. core + CLI (+ all packages) via Turbo
pnpm dev:examples build --release --filter react-ts                   # 3. example app (embedded server)
```

Then install it with `capsule run android --release` from the example dir (§4).

---

## 6. Device management (adb)

```sh
adb devices                        # list connected devices
adb logcat -s CapsuleActivity      # Capsule-specific logs
adb logcat "*:E"                   # errors only
adb uninstall dev.capsule.myapp    # uninstall the app
adb shell pm list packages capsule # confirm install
```

---

## 7. Known bundler issues

### rspack — `defineConfig is not a function` (rspack ≥ 1.7)

`defineConfig` was removed from `@rspack/core` in 1.7.x. Export the config object directly:

```js
// ❌ broken in 1.7+
const { defineConfig, HtmlRspackPlugin } = require('@rspack/core')
module.exports = defineConfig({ ... })

// ✅ correct
const { HtmlRspackPlugin } = require('@rspack/core')
module.exports = { ... }
```

### rspack — `Module not found: Can't resolve './app-element'`

rspack does not resolve `.ts` extensions by default. Add `resolve.extensions`:

```js
module.exports = {
  resolve: {
    extensions: ['.ts', '.js'],
  },
  ...
}
```

### rspack + Lit — class field shadowing reactive properties

When using Lit web components, native class fields (the SWC default) overwrite Lit's reactive property accessors, causing `@property()` decorators to silently stop working. Set `useDefineForClassFields: false` in the SWC transform:

```js
module: {
  rules: [{
    test: /\.ts$/,
    loader: 'builtin:swc-loader',
    options: {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, useDefineForClassFields: false },
        target: 'es2020',
      },
    },
  }],
},
```

Symptom: `Uncaught Error: The following properties on element <x> will not trigger updates as expected because they are set using class fields`.

---

## 8. Turbo, docs and repo tooling

```sh
pnpm run build          # build all packages via Turbo
pnpm run test           # test all packages via Turbo
pnpm run lint           # lint all packages via Turbo
pnpm docs:check         # mkdocs nav + map-level links
pnpm docs:lint          # deep docs consistency: all links, phase numbering, principles mirror, INDEX coverage
pnpm test:scripts       # node --test for the contributor scripts' pure logic
pnpm update:quickjs [ref]    # re-vendor quickjs-ng (packages/capsule-android/.../cpp/quickjs)
pnpm update:civetweb [tag]   # re-vendor CivetWeb (packages/native/civetweb) — release tags only
```

---

## 9. Before committing (pre-commit checklist)

**Apply Prettier before staging any commit** — an unformatted file is the most common avoidable
diff-noise and review nit. The capsule monorepo is the Prettier source of truth.

```sh
pnpm run format
pnpm run format:check          # must print "All matched files use Prettier code style!"
pnpm run lint
pnpm run test                  # Turbo: @capsule/core + @capsule/cli vitest (+ other packages)
pnpm with-env --cwd packages/capsule-android gradlew testDebugUnitTest   # Kotlin JVM unit tests
pnpm docs:check                # after doc edits
```

Then commit per-repo (English Conventional Commits), one repo at a time —
`capsule` / `examples` / `templates` each have their own history.

**Scope caveats for `pnpm format`:**
- It only matches `packages/*/src/**/*.ts` in the **capsule** repo. It does **not** touch `.tsx`
  files, nor the `examples` and `templates` repos. Format those with a direct invocation when they
  change, e.g. from the example dir: `npx prettier --write "src/**/*.{ts,tsx}"`.
- Device/instrumented tiers (`connectedDebugAndroidTest`, `run android --release`) are **not**
  part of the routine pre-commit gate — run them when native/Kotlin code changes (stale-AAR rule).
