# Contributing to Capsule

Thanks for helping. This guide covers setup, the test layers, and what a pull request needs.
By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go
through [SECURITY.md](SECURITY.md), not public issues.

## Setup

You need Node 22.12+ and pnpm 9. Android work also needs JDK 17 and the Android SDK/NDK; iOS work
runs in Docker (no Mac needed for the Swift tests). Full machine setup:
[docs/contributing/environment.md](docs/contributing/environment.md).

```sh
pnpm install
pnpm build
```

## Definition of done

`pnpm verify` is green: format check, lint, build, typecheck, tests and `docs:check` — the same
checks CI runs (`.github/workflows/ci.yml`). When native code changed, also run the platform layer:

| Layer | Command (from the repo root) |
|---|---|
| Everything without a device | `pnpm verify` (`--keep-going` reports every failure) |
| Kotlin build + JVM unit tests | `pnpm verify:android` |
| Swift (Docker, `swift:6.4-jammy`) | `pnpm verify:ios` |
| Android instrumented (emulator/device) | `pnpm with-env --cwd packages/capsule-android gradlew connectedDebugAndroidTest` |

Machine paths (JDK, Android SDK, AVD) go in a git-ignored `.env.local` — copy `.env.example`.

Every native API follows the same shape — an interface, a fake, a platform provider, and a handler
test on the plain JVM / Linux. New code follows it too; see an existing API such as haptics or
geolocation, and [docs/contributing/testing.md](docs/contributing/testing.md).

## Pull requests

1. Branch from `main`; keep a PR to one concern.
2. Add or update tests with the change.
3. Format before committing: `pnpm format`, then `pnpm format:check` must be clean.
4. Update the docs the change affects (`docs/`); `pnpm verify` runs `docs:check`.
5. Commit messages follow the existing style: `feat(scope): …`, `fix(scope): …`, `docs: …`.
6. Describe what changed and how you tested it.

## Vendored code

`packages/native/civetweb` and `packages/native/quickjs` are copies
of upstream projects. Don't edit them; update them with `node scripts/update-civetweb.mjs <tag>`
or `node scripts/update-quickjs.mjs <tag>` (release tags only).

## Licensing of contributions

Contributions are accepted under the license of the code they change: Apache-2.0 for the
framework, AGPL-3.0 for `packages/codesync-api` (see [NOTICE](NOTICE)). By opening a pull request
you confirm you have the right to submit the work under that license.
