# Capsule Framework

Ship any web bundle inside a generated native shell — with an on-device runtime
(CivetWeb + QuickJS), a native-API bridge, and OTA code push (CodeSync).

Monorepo (pnpm + turbo): framework core, CLI, native Android shell, iOS shell (in bring-up),
CodeSync delivery server, and the documentation site.

## Layout

| Path | What |
|---|---|
| [`packages/core`](packages/core/README.md) | the app-facing TypeScript API (camera, filesystem, network, app lifecycle, `db`, `ai`, …) |
| [`packages/cli`](packages/cli/README.md) | `capsule init/add/add-ui/sync/dev/build/run/doctor` + OTA (`codesync`) |
| [`packages/capsule-android`](packages/capsule-android/README.md) | the Android native shell (Kotlin + C AAR) |
| [`packages/capsule-ios`](packages/capsule-ios/README.md) | the iOS shell (Swift package — manifest at the repo root, [`Package.swift`](Package.swift)) |
| [`packages/native/civetweb`](packages/native/civetweb/README.md) | the embedded HTTP server, vendored and shared by both shells |
| [`packages/ui-kit`](packages/ui-kit) | Capsule UI — Tailwind class builders copied into apps by `capsule add-ui` |
| [`packages/codesync-api`](packages/codesync-api/README.md) | self-hostable OTA delivery server (Fastify, AGPL-3.0) |
| [`docs/`](docs/index.md) | documentation source (mkdocs) — index inside |

**Agents:** read [`AGENTS.md`](AGENTS.md) — task, target, files, navigation, update rules.

## Documentation

The docs site is built with mkdocs (`mkdocs gh-deploy` in CI):

- [Guide](docs/guide/installation.md) — install, quickstart, native APIs (`db`, `ai`, push, …), publishing
- [Reference](docs/reference/cli.md) — CLI, core API, lockfile
- [Concepts](docs/concepts/architecture.md) — architecture, principles, comparisons, primers
- [Decisions](docs/decisions/index.md) — binding ADRs
- [Contributing](docs/contributing/index.md) — environment, testing, CI, release, workflows
- [Project](docs/project/roadmap.md) — roadmap, state, history, business, server design

Exploring locally: `mkdocs serve` (state at a glance: [`docs/project/state.md`](docs/project/state.md)).

## Development

Install dependencies, then build and test everything from the root:

```bash
pnpm install
pnpm build
pnpm test
pnpm docs:check    # docs consistency check
```

Per-package commands are in each `packages/*/README.md`. Machine-level environment
setup (JDK, Android SDK, emulators): [`docs/contributing/environment.md`](docs/contributing/environment.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the test layers and the pull-request process,
and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately — see
[SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE), except [`packages/codesync-api`](packages/codesync-api/LICENSE), which is
[AGPL-3.0](packages/codesync-api/LICENSE) — self-host it freely; a modified version offered as a
hosted service must publish its changes. Third-party notices: [NOTICE](NOTICE).
