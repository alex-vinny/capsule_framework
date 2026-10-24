# AGENTS.md — scripts/ (contributor tooling)

Parent: [`../AGENTS.md`](../AGENTS.md). Every script is listed with its `pnpm` name in
[`docs/contributing/commands.md`](../docs/contributing/commands.md).

Node scripts for working *on* the framework, each exposed as a root `pnpm` script. App developers
never need them — their tool is the CLI.

| Script | `pnpm` | What |
|---|---|---|
| `verify.mjs` | `verify`, `verify:android`, `verify:ios` | the definition of done |
| `docs-check.mjs`, `docs-lint/` | `docs:check`, `docs:lint` | docs nav, links, coverage |
| `gen/` | `gen`, `gen:check` | generated reference + CLI toolchain module |
| `dev-env.mjs`, `with-env.mjs`, `emulator.mjs` | `dev:env`, `with-env`, `dev:emulator` | machine env + emulator |
| `examples.mjs` | `dev:examples` | one action across every example app |
| `update-civetweb.mjs`, `update-quickjs.mjs` | `update:civetweb`, `update:quickjs` | re-vendor `packages/native/*` |
| `upkeep/` | `upkeep` | dependency, toolchain and store-requirement report |
| `lib/env.mjs` | — | shared: `.env.local`, per-OS executables, `run()` |

## Test

```sh
pnpm test:scripts     # node --test "scripts/**/*.test.mjs"
```

## Local rules

- **OS-agnostic:** Node built-ins only; spawn tools through `scripts/lib/env.mjs` (it handles
  `.bat`/`.cmd` on Windows). No PowerShell or bash-only scripts.
- **No machine paths in code:** read them from `.env.local` via `lib/env.mjs`; document every new key
  in the repo-root `.env.example`.
- Start each script with a header comment: what it does and its usage lines.
- A new script gets a root `package.json` entry and a line in `docs/contributing/commands.md`.
- Keep pure logic separate from I/O so it can be tested with `*.test.mjs` next to it.
