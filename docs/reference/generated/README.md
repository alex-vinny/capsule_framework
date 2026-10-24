# Generated reference

Everything in this folder except this README is **generated** — never edit it by hand; change the
source and regenerate.

| Page | Generated from |
|---|---|
| [`core/`](core/README.md) | the `@capsule/core` TypeScript API (`packages/core/src`), by TypeDoc + typedoc-plugin-markdown (`packages/core/typedoc.json`) |
| [`cli.md`](cli.md) | the commander definitions of every `capsule` command (`packages/cli/src/commands/`, assembled in `src/program.ts`) |
| [`config.md`](config.md) | `CONFIG_FIELDS` in `packages/cli/src/config.ts` — `tsc` fails if a `CapsuleConfig` key has no entry |

```sh
pnpm gen               # build the CLI, then regenerate every page here
pnpm gen:check         # CI: regenerate into a temp dir, fail if these pages are stale
```

The scripts live in `scripts/gen/` (`index.mjs` runs them; `--only core|cli|config` runs one).
The hand-written guides link here for the exhaustive lists instead of repeating them.
