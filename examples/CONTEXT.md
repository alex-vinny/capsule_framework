# CONTEXT — examples/ (Layer 2)

Demo apps proving Capsule across frameworks and bundlers — their own pnpm workspace inside the
monorepo, linking the in-repo `packages/core`. Parent map: `../docs/CONTEXT.md`.
Full catalog + dev-mode mechanics: **`README.md`** (read it before opening an example).

## Groups

- **From-template** (`*-from-template`) — exact `capsule init` output per template
  (react, vue, svelte, angular, vanilla-js, vanilla-ts, jquery).
- **React+Vite feature apps** — `react-ts` (**canonical native-API demo**),
  `react-ts-native` (look-and-feel sandbox only), `react-ts-tailwind`.
- **Non-Vite bundlers** — `webpack-preact`, `rspack-lit`, `rollup-solid` (CLI proxy).

## Conventions

- Add/demo a native API in **`react-ts`** (feature-screen registry + `ui.tsx`). Never wire
  real APIs into `react-ts-native`.
- Don't restate build/run commands here — `../docs/contributing/commands.md` owns them; emulator +
  env helpers are the repo-root `pnpm dev:*` scripts (`../scripts/`).
- A framework change that affects an example updates that example in the same change.
