# CLI reference

> Generated from the commander definitions in `packages/cli/src/commands/` by `pnpm gen` — do not edit.

Capsule CLI — app ships inside a managed native capsule Version: run `capsule --version`.

## `capsule init`

Scaffold a new Capsule project from a template

```
capsule init [options] [name]
```

| Argument | Required | Description | Default |
|---|---|---|---|
| `[name]` | no | project directory name | — |

| Option | Description | Default |
|---|---|---|
| `--template <template>` | official name (react-ts, vue-ts, …), a GitHub/GitLab/Bitbucket URL (or gh:owner/repo[/subdir][#ref]), a tarball URL, or a local path | — |
| `--app-id <appId>` | reverse-domain app ID | — |
| `--css <css>` | optional CSS layer: none (default) \| tailwind | — |
| `--test <test>` | optional test harness: none (default) \| vitest | — |

## `capsule add`

Add a platform to this Capsule project

```
capsule add [options] <platform>
```

| Argument | Required | Description | Default |
|---|---|---|---|
| `<platform>` | yes | android \| ios (ios is recorded in capsule.lock, but sync only generates android so far) | — |

## `capsule add-ui`

Copy Capsule UI components (Tailwind class builders) into this project

```
capsule add-ui [options] <components...>
```

| Argument | Required | Description | Default |
|---|---|---|---|
| `<components...>` | yes | component names, e.g. button card | — |

| Option | Description | Default |
|---|---|---|
| `--dir <dir>` | target directory, relative to the project | `src/ui` |
| `--force` | overwrite files that already exist | `false` |

## `capsule sync`

Regenerate .capsule/ wrappers from capsule.config.ts and capsule.lock

```
capsule sync [options]
```

| Option | Description | Default |
|---|---|---|
| `--frozen-lockfile` | fail if capsule.lock is out of date | — |

## `capsule codesync`

CodeSync OTA update commands

```
capsule codesync [options] [command]
```

### `capsule codesync publish`

Publish a new bundle

```
capsule codesync publish [options]
```

| Option | Description | Default |
|---|---|---|
| `--channel <channel>` | OTA channel (e.g., production, staging) | `production` |
| `--notes <notes>` | Release notes (optional) | — |

## `capsule dev`

Start dev server with hot reload on device/emulator

```
capsule dev [options]
```

| Option | Description | Default |
|---|---|---|
| `--port <port>` | dev server port | `5173` |
| `--tunnel` | expose via Cloudflare tunnel (prints QR) | — |
| `--qr` | print QR code for LAN access | — |
| `--verbose` | print commands and timing | — |

## `capsule build`

Build a native app bundle

```
capsule build [options] <platform>
```

| Argument | Required | Description | Default |
|---|---|---|---|
| `<platform>` | yes | android (the only platform supported so far) | — |

| Option | Description | Default |
|---|---|---|
| `--release` | minified release build, signed with the local debug keystore (~/.android/debug.keystore) — not accepted by app stores yet | — |
| `--format <format>` | apk \| aab | `apk` |
| `--verbose` | print commands and timing | — |

## `capsule run`

Install the built APK on a device or emulator (does not launch it)

```
capsule run [options] <platform>
```

| Argument | Required | Description | Default |
|---|---|---|---|
| `<platform>` | yes | android (the only platform supported so far) | — |

| Option | Description | Default |
|---|---|---|
| `--device <id>` | target device ID (from: adb devices) | — |
| `--release` | install the release APK instead of debug | — |

## `capsule test`

Run the app test suite (Vitest)

```
capsule test [options] [args...]
```

| Argument | Required | Description | Default |
|---|---|---|---|
| `[args...]` | no | arguments passed through to vitest (file filters, flags) | — |

| Option | Description | Default |
|---|---|---|
| `--watch` | run vitest in watch mode | — |

## `capsule doctor`

Diagnose the development environment and check store requirements

```
capsule doctor [options]
```

| Option | Description | Default |
|---|---|---|
| `--strict` | exit non-zero when the app violates a store requirement | — |
