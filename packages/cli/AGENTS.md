# AGENTS.md — packages/cli (`@capsule/cli`)

Parent: [`../../AGENTS.md`](../../AGENTS.md). File map: [`README.md`](README.md).

The `capsule` command app developers run: `init`, `add`, `add-ui`, `sync`, `dev`, `build`, `run`,
`test`, `doctor`, `codesync`. Framework-contributor tooling is *not* here — it lives in `scripts/`.

## Entry files

- `src/index.ts` → `src/program.ts` (`createProgram()` builds the command tree).
- `src/commands/<name>.ts` — one file per command.
- `src/config.ts` — `capsule.config.ts` loader, the `CapsuleConfig` type, and `CONFIG_FIELDS`
  (the field table the config reference is generated from).
- `src/sync/` — the generated Android project (Gradle, catalog, manifest, permissions).
- `src/platform/` — toolchain versions and store requirements shared by `init`, `sync`, `doctor`.
- `assets/testing/` — per-framework test fixtures copied by `capsule test`.

## Test

```sh
pnpm --filter @capsule/cli test          # vitest (src/__tests__/)
pnpm --filter @capsule/cli typecheck     # also fails if a CapsuleConfig key lacks a CONFIG_FIELDS entry
pnpm --filter @capsule/cli build         # tsup → dist/ ; run with `pnpm capsule …` from the root
```

## Local rules

- A new `CapsuleConfig` key needs a `CONFIG_FIELDS` entry (the typecheck enforces it); a new
  command or option needs a description — both feed the generated reference (`pnpm gen`).
- Android versions in generated apps come from the library catalog
  (`packages/capsule-android/gradle/libs.versions.toml`) — don't hard-code a version in `sync/`.
- Local AARs don't carry their dependencies: a new runtime dependency of the Android library must
  also be added to the app dependencies `sync` generates.
- Commands must work on Windows, macOS and Linux — use `execa` and `path`, never shell strings.

## Docs

`docs/reference/cli.md` · `docs/reference/generated/{cli,config}.md` (generated) ·
`docs/guide/quickstart.md`.
