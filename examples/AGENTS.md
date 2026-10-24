# AGENTS.md — examples/ (demo apps)

Parent: [`../AGENTS.md`](../AGENTS.md). Catalog and groups: [`CONTEXT.md`](CONTEXT.md) ·
dev-mode mechanics: [`README.md`](README.md).

Thirteen apps proving Capsule across frameworks and bundlers. They are their **own pnpm workspace**
(`pnpm-workspace.yaml` here), so the root install never pulls their framework dependencies. Each
app links the in-repo core with `"@capsule/core": "link:../../packages/core"`.

## Setup and test

```sh
pnpm install && pnpm build              # repo root first: core + CLI
cd examples && pnpm install             # one lockfile for every app
pnpm dev:examples all                   # from the root: install → build → test every app
pnpm dev:examples build --filter react  # a subset
```

Run an app on a device with `capsule dev android` inside its folder — not `pnpm run dev`, which
skips `adb reverse`.

## Local rules

- A framework change that affects an example updates that example in the same change.
- Native APIs are demoed in **`react-ts`** (feature-screen registry + `ui.tsx`). `react-ts-native`
  is a look-and-feel sandbox only — never wire real APIs into it.
- `*-from-template` apps mirror `capsule init` output — when a template changes, bring them back
  in line with it.
- Use `link:` for `@capsule/core` (a `workspace:*` link can't cross into the root workspace).
- Don't restate build/run commands in app READMEs — link `../docs/contributing/commands.md`.

## Docs

`docs/contributing/testing.md` · `docs/contributing/template-authoring.md`.
