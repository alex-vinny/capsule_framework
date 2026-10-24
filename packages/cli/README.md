# @capsule/cli — the Capsule CLI

The command-line tool app developers use: `capsule init/add/add-ui/sync/dev/build/run/test/doctor`,
plus OTA operations (`codesync`). Tooling for working *on* the framework (emulator, examples
batch, vendoring QuickJS/CivetWeb) is not part of the CLI — it lives in the repo's `scripts/`
as `pnpm dev:*` / `pnpm update:*` scripts (see [`docs/contributing/commands.md`](../../docs/contributing/commands.md)).

## Key files

| Path | What |
|---|---|
| `src/index.ts` | CLI entry: command registration |
| `src/commands/` | one file per command (`init.ts`, `dev.ts`, `sync.ts`, …) |
| `src/lib/` | shared helpers (`ui-kit.ts` for `add-ui`, `zip.ts` for `codesync`) |
| `src/config.ts` | `capsule.config.ts` loader + the `CapsuleConfig` type (incl. the `codeSync` block) |
| `src/sync/` | Android project generation (Gradle, manifest, permissions) |
| `src/dev-proxy-server.ts` · `src/dev-routes-server.ts` | the `capsule dev` loop |
| `src/__tests__/` | vitest suites |

## Build & test

```bash
pnpm --filter @capsule/cli run build    # tsup → dist/
pnpm --filter @capsule/cli run test     # vitest
node packages/cli/dist/index.js ...     # or `pnpm capsule ...` from the repo root
```

## Docs

Canonical reference: [`docs/reference/cli.md`](../../docs/reference/cli.md).
Repo map / how to navigate: [`AGENTS.md`](../../AGENTS.md) at the repo root.
