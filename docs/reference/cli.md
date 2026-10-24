---
title: "CLI"
audience: app-developer
status: current
code:
  - packages/cli/src/program.ts
  - packages/cli/src/config.ts
  - packages/cli/src/commands/**
  - packages/cli/src/sync/**
tests:
  - packages/cli/src/__tests__/**
---
# CLI (`@capsule/cli`)

> The `capsule` command creates, runs, builds and ships Capsule apps. This page explains what each
> command does and which files it reads and writes.
>
> - Every command, argument, option and default: **[generated CLI reference](generated/cli.md)**,
>   built from the commander definitions, so it is always current.
> - Every `capsule.config.ts` field: **[generated config reference](generated/config.md)**.

---

## Running the CLI

Inside this repo, build the CLI and run its entry point:

```sh
pnpm --filter @capsule/cli build
node packages/cli/dist/index.js --version
```

The examples below write `capsule …`; substitute `node <repo>/packages/cli/dist/index.js …` until
you have the binary on your `PATH`.

Android builds need two things from your environment: a JDK 17 (`JAVA_HOME`) and, today, the path
of a locally built shell AAR in `CAPSULE_SHELL_OVERRIDE_PATH` (see [`capsule sync`](#capsule-sync)).
[environment.md](../contributing/environment.md) covers the full machine setup.

---

## The app workflow

```sh
capsule init my-app --template react-ts --app-id com.example.myapp
cd my-app
capsule add android          # registers the platform and generates .capsule/android/
capsule dev                  # live reload on a device or emulator (debug build)
capsule build android        # web bundle + route bundle + Gradle build
capsule run android          # install the APK on a device or emulator
capsule codesync publish     # ship a web-only update over the air
```

A **debug** build loads the app from the dev server (`capsule dev`). A **release** build
(`--release`) serves the bundled files from the embedded server inside the app and needs no dev
server.

---

## Commands

### `capsule init`

Creates a project folder from a template, then runs `pnpm install` in it.

**Template sources.** `--template` accepts:

- an official name (`react-ts`, `vue-ts`, `svelte-ts`, `angular-ts`, `vanilla-ts`, `vanilla-js`,
  `jquery-bootstrap`). In a checkout of this workspace the CLI copies it from the local
  `templates/` folder; otherwise it downloads it from the templates repository with
  [giget](https://github.com/unjs/giget). The template list itself comes from that repository's
  `manifest.json`, with a built-in list as the offline fallback;
- a GitHub, GitLab or Bitbucket URL as copied from the browser, or giget shorthand
  (`gh:owner/repo[/subdir][#ref]`), or a tarball URL;
- a local path.

**Files written.** `capsule.config.ts` (only if the template does not ship one), `capsule.lock`,
and `.gitignore` (only if missing). The generated config sets `appId`, `appName`, `version` and the
Android SDK levels; for `angular-ts` it also sets `web.buildCommand` and `web.devCommand`.

**Styling and tests.**

- `--css tailwind` adds Tailwind CSS with the Capsule "native preset": an iOS-style look on the
  shared `.btn`/`.card`/`.tab` class names, so the same markup looks consistent across templates.
  Templates without Tailwind support keep plain CSS and the CLI says so.
- `--test vitest` adds the opt-in test harness (route contract, unit, component and QuickJS
  fidelity tiers). Run it with [`capsule test`](#capsule-test). See
  [testing.md](../contributing/testing.md).

CSS preprocessors (Sass/SCSS, Less, Stylus) are your bundler's job, not Capsule's: install them in
the app exactly as in any Vite, Webpack, Rspack or Rollup project. A native component layer
("Capsule UI") is a separate track, see [0002-capsule-ui.md](../decisions/0002-capsule-ui.md) and
[`capsule add-ui`](#capsule-add-ui).

### `capsule add`

`capsule add android` records the platform in `capsule.lock` and runs `capsule sync`.
`capsule add ios` records the platform too, but `sync` generates only the Android project today;
the iOS shell is in bring-up ([ios-bring-up.md](../contributing/ios-bring-up.md)).

### `capsule add-ui`

Copies Capsule UI components ([0002-capsule-ui.md](../decisions/0002-capsule-ui.md)) into the app,
shadcn-style: the app owns the copy and may edit it. The components are **Tailwind class
builders** from `@capsule/ui-kit` (functions that return a class string), not framework
components, so the same files work in every template.

```sh
capsule add-ui button card          # one or more component names
capsule add-ui dialog --dir src/lib/ui
capsule add-ui button --force       # overwrite a copy you already have
```

Component names are the files in ui-kit's `src/components/` (case-insensitive): today `button`,
`card`, `dialog`, `input` (which also exports `textarea`), `select`, `table`. An unknown name fails
before anything is copied and lists the available ones. Without `--force`, existing files are kept
and reported, because you may have customised them.

What lands in the project mirrors ui-kit's own layout, so the components' `../tokens` imports keep
working: `<dir>/tokens.ts` (shared presets and `cn`) and `<dir>/components/<name>.ts`.

```ts
import { button } from './ui/components/button'
// <button class={button({ variant: 'outline', preset: 'ios' })}>Save</button>
```

The command does not edit `capsule.config.ts`; make sure your Tailwind `content` globs include the
target directory. Sources come from the installed `@capsule/ui-kit` package, which ships its
`src/` for this purpose.

### `capsule sync`

Reads `capsule.config.ts` and regenerates `.capsule/android/`, the native project you never edit
by hand. Run it after changing the config; `add` and `build` run it for you.

**Shell.** The Capsule shell AAR comes from `CAPSULE_SHELL_OVERRIDE_PATH` (a locally built
`capsule-release.aar`). Resolving released shells from a registry is planned (Phase 8); until then
`sync` fails without the variable.

**Generated files**, all under `.capsule/android/`:

```
settings.gradle.kts, build.gradle.kts, gradle.properties
gradle/libs.versions.toml          ← dependency versions for the app module
gradlew, gradlew.bat, gradle/wrapper/
libs/capsule.aar                   ← the shell
app/build.gradle.kts               ← SDK levels, version, dev-server URL for debug builds
app/src/main/AndroidManifest.xml   ← permissions from android.permissions
app/src/main/res/values/strings.xml
app/src/main/res/xml/capsule_file_paths.xml
app/src/main/kotlin/<appId>/MainActivity.kt         ← extends CapsuleActivity
app/src/androidTest/kotlin/<appId>/SmokeTest.kt     ← on-device smoke test
app/src/main/assets/www/, assets/server/            ← filled by capsule build
```

`sync` deletes and rewrites only these generated sources. It never touches `build/`, where the
Gradle daemon may hold file locks. The Gradle wrapper is copied from the shell's own Gradle
project when the AAR sits inside one; otherwise `sync` runs `gradle wrapper`.

**Lock file.** `sync` then writes `capsule.lock` with the CLI version, the SHA-256 of the shell AAR
and a hash of the config ([lockfile.md](lockfile.md)). `capsule sync --frozen-lockfile` regenerates
nothing: it fails when the AAR or the config changed since the last sync, which makes it a CI
check.

### `capsule dev`

Starts the dev server with hot reload, for a debug build on a device or emulator.

- **Ports.** The dev server listens on `devPort` (default 5173, or `--port`). A **route sidecar** on
  `devPort + 1000` runs your `/api` routes and serves `/_capsule` and `/__capsule.js`.
- **Device access.** `adb reverse` maps both ports, so the device reaches them as `localhost` on a
  USB device and on an emulator alike. The debug build's dev-server URL is
  `http://localhost:<devPort>`.
- **Vite** (the default): the CLI starts Vite itself, proxies the sidecar paths and injects
  `/__capsule.js` into every page. It ignores `.capsule/`, `dist/` and `.gradle/` so Gradle builds
  can run at the same time.
- **Other bundlers** (`web.devCommand`): for `ng serve` the CLI writes `.capsule/proxy.json` and
  adds `--proxy-config`. For `webpack serve`/`rspack serve` it runs a dev proxy on `devPort` and the
  bundler on `devPort + 1` (passed as `CAPSULE_INTERNAL_PORT`).
- `--tunnel` exposes the server through a Cloudflare quick tunnel (`cloudflared`) and prints a QR
  code; `--qr` prints one for the LAN address.

### `capsule build`

`capsule build android` produces an installable app:

1. warns when the config breaks or will soon break an app-store rule (see [`capsule doctor`](#capsule-doctor)); the build continues;
2. runs `capsule sync`;
3. builds the web app (`web.buildCommand`, or `pnpm exec vite build`) into `dist/`;
4. injects the mobile CSS reset into `dist/index.html` unless `web.mobileReset: false`
   ([mobile-css-reset.md](../guide/mobile-css-reset.md));
5. copies `dist/` to `.capsule/android/app/src/main/assets/www/`;
6. bundles the route handlers with esbuild into `assets/server/bundle.js` for QuickJS:
   `src/routes/<method>.ts` default exports become JSON-RPC overrides, and
   `src/server/routes/**/*.ts` exported `GET`/`POST`/`PUT`/`DELETE`/`PATCH` functions become
   `/api/<path>` routes;
7. runs Gradle: `assembleDebug`, `assembleRelease` with `--release`, or `bundleRelease` with
   `--release --format aab`.

The APK lands in `.capsule/android/app/build/outputs/apk/{debug,release}/`. Only Android is
supported so far. Release signing is left to Gradle.

### `capsule run`

`capsule run android` installs the built APK with `adb install -r`: the debug APK, or the release
APK with `--release` (it falls back to `app-release-unsigned.apk` when no signed one exists).
`--device` picks a device from `adb devices`. It installs but does not launch the app; open it on
the device.

### `capsule test`

Runs the app's Vitest suite (`pnpm exec vitest run`, or watch mode with `--watch`). Extra
arguments pass through to Vitest, e.g. `capsule test routes`. The project needs the harness from
`capsule init --test vitest`; without a `vitest.config.ts` the command explains how to add it.
Suites are hermetic; set `CAPSULE_API_BASE` to also run the integration test against a live API.

### `capsule doctor`

Checks the development environment: Node.js, pnpm, a JDK, `adb`, whether a device or emulator is
connected, and whether `CAPSULE_SHELL_OVERRIDE_PATH` is set. It exits with code 1 when a required
tool is missing.

Run inside an app (a folder with `capsule.config.ts`), it also checks the config against the
app-store rules bundled with the CLI, such as the minimum `targetSdk` Google Play accepts, and
prints the date those rules were last reviewed. `--strict` makes a violated rule exit non-zero.

### `capsule codesync publish`

Builds, zips and uploads a web-only update to a CodeSync server. How to set it up and use it:
[ota-updates.md](../guide/ota-updates.md). The bundle format and protocol:
[codesync-internals.md](../contributing/codesync-internals.md).

---

## Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `CAPSULE_SHELL_OVERRIDE_PATH` | `sync`, `add`, `build`, `doctor` | Path to the shell AAR to embed. Required until the shell registry exists. |
| `JAVA_HOME` | `build` (Gradle) | JDK 17 used by the Android build. |
| `CAPSULE_API_BASE` | `test` | Base URL for the optional live-API integration test. |
| `CAPSULE_INTERNAL_PORT` | set by `dev` | The port a non-Vite bundler should listen on behind the dev proxy. |

`CODESYNC_URL` and `CODESYNC_API_KEY` are a convention for the `codeSync` block in
`capsule.config.ts`, not variables the CLI reads itself.

---

## For contributors: how the CLI is built

| Path (`packages/cli/`) | Responsibility |
|---|---|
| `src/index.ts`, `src/program.ts` | Entry point; `createProgram()` registers every command (also used by the docs generator). |
| `src/commands/*.ts` | One file per command, each exporting a commander `Command`. |
| `src/config.ts` | `CapsuleConfig`, `loadConfig()` (runs `capsule.config.ts` through jiti, no build step), and `CONFIG_FIELDS`, the field list behind the generated config reference. |
| `src/sync/sync.ts`, `src/sync/resolve-shell.ts` | The Android project generator and shell resolution. |
| `src/platform/` | Store requirements and the Android toolchain versions the generator uses. |
| `src/dev-routes-server.ts`, `src/dev-proxy-server.ts` | The `capsule dev` route sidecar and the proxy for non-Vite bundlers. |
| `src/lib/ui-kit.ts`, `src/lib/zip.ts` | `add-ui` copy logic; the cross-platform ZIP writer for `codesync publish`. |
| `src/tailwind.ts`, `src/testing.ts`, `src/mobile-css-reset.ts` | `init --css`, `init --test`, and the reset `build` injects. |
| `src/__tests__/` | Vitest suites (`pnpm --filter @capsule/cli test`). |

To add a command: create `src/commands/<name>.ts`, register it in `src/program.ts`, describe every
argument and option in the commander definition, then run `pnpm docs:gen` so the
[generated reference](generated/cli.md) picks it up.

The exact dependency list and scripts are in `packages/cli/package.json`; versions follow
[upkeep.md](../contributing/upkeep.md).
