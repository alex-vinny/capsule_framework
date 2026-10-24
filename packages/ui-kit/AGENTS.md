# AGENTS.md — packages/ui-kit (`@capsule/ui-kit`, Capsule UI)

Parent: [`../../AGENTS.md`](../../AGENTS.md).

Framework-agnostic Tailwind class builders and design tokens (iOS / Material presets). No
component renders anything: each template binds the classes to its own elements, so behaviour is
per-framework and the look is shared. `capsule add-ui <components…>` copies the sources into an app.

## Entry files

- `src/index.ts` — the public exports.
- `src/tokens.ts` — `presets`, `tokensFor`, `cn`.
- `src/components/<name>.ts` — one class builder per component.
- `tests/ui-kit.test.mjs` — `node --test` against the built output.

## Test

```sh
pnpm --filter @capsule/ui-kit build && pnpm --filter @capsule/ui-kit test
pnpm --filter @capsule/ui-kit typecheck
```

## Local rules

- **Pure frontend/CSS** — never import `@capsule/core` or touch a native API.
- No runtime dependencies; output is class strings only.
- A new component is a new `src/components/<name>.ts` exported from `src/index.ts`; the CLI's
  `add-ui` lists components from this folder (`packages/cli/src/lib/ui-kit.ts`).

## Docs

`docs/decisions/0002-capsule-ui.md` · `docs/guide/mobile-css-reset.md`.
