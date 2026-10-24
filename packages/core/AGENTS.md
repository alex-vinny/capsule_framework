# AGENTS.md — packages/core (`@capsule/core`)

Parent: [`../../AGENTS.md`](../../AGENTS.md). File map: [`README.md`](README.md).

The TypeScript API an app's web layer imports (`camera`, `db`, `ai`, `push`, …). Each module is a
thin class over the `Bridge` that sends JSON-RPC calls to the native shell.

## Entry files

- `src/index.ts` — the public surface: every module instance, its types, its method names.
- `src/bridge.ts` (native bridge protocol) · `src/web-bridge.ts` (browser/dev adapter).
- `src/<api>.ts` — one file per API · `src/router.ts` — the `./routes` subpath (on-device `/api`).
- `src/testing/fake-bridge.ts` — `FakeBridge`, exported for app tests.

## Test

```sh
pnpm --filter @capsule/core test        # vitest (src/__tests__/<api>.test.ts)
pnpm --filter @capsule/core typecheck
```

## Local rules

- **No runtime dependencies** — the package ships to every app; keep `dependencies` empty.
- A module only calls `bridge.call(METHOD, params)`; method names live in a `METHODS` const and are
  the wire contract with both shells — renaming one is a breaking change on Android and iOS.
- New API: add `src/<api>.ts`, export it from `src/index.ts`, add `src/__tests__/<api>.test.ts`
  against `FakeBridge`, and give it a capability version (`src/capabilities.ts`). The native side
  follows `docs/contributing/workflows/add-native-api/`.
- The public API is documented from TSDoc (`pnpm gen`); write the doc comment with the export.

## Docs

`docs/reference/core-api.md` (contract) · `docs/reference/generated/core/` (generated) ·
`docs/concepts/architecture.md` · per-API guides in `docs/guide/`.
