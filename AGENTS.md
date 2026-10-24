# AGENTS.md — start here

Capsule is a mobile app framework: a web app (any framework) runs in a native Android/iOS shell
that embeds a loopback HTTP server (CivetWeb) and a JS engine (QuickJS) for on-device `/api`
routes, with native APIs over a bridge and over-the-air updates (CodeSync).

This file is the single entry point for every coding agent. Tool-specific files (`CLAUDE.md`,
`GEMINI.md`, `.github/copilot-instructions.md`) only point here. Each folder in the map below has
its own `AGENTS.md` with local rules and the exact test command — read it before editing there.

## Repo map

| Folder | What | Local rules |
|---|---|---|
| `packages/core` | `@capsule/core` — the app-facing TypeScript API | [AGENTS](packages/core/AGENTS.md) |
| `packages/cli` | `@capsule/cli` — `capsule init/dev/sync/build/…` | [AGENTS](packages/cli/AGENTS.md) |
| `packages/capsule-android` | Android shell (Kotlin + JNI/C) → the AAR | [AGENTS](packages/capsule-android/AGENTS.md) |
| `packages/capsule-ios` | iOS shell (Swift; manifest is the root `Package.swift`) | [AGENTS](packages/capsule-ios/AGENTS.md) |
| `packages/native` | vendored C shared by both shells (CivetWeb, QuickJS-ng) | [AGENTS](packages/native/AGENTS.md) |
| `packages/codesync-api` | self-hostable OTA server (AGPL-3.0) | [AGENTS](packages/codesync-api/AGENTS.md) |
| `packages/ui-kit` | Capsule UI — Tailwind class builders + tokens | [AGENTS](packages/ui-kit/AGENTS.md) |
| `examples/` | demo apps, a nested pnpm workspace | [AGENTS](examples/AGENTS.md) |
| `scripts/` | contributor tooling behind root `pnpm` scripts | [AGENTS](scripts/AGENTS.md) |
| `docs/` | the docs site (mkdocs) — guide, reference, concepts, decisions, contributing, project | [CONTEXT](docs/CONTEXT.md) |

`templates` is a separate public repo (`github:alex-vinny/capsule-templates`) that `capsule init`
fetches — see `docs/contributing/template-authoring.md`.

## Read order

Read top-down and stop when you have enough. References only point down.

```
Layer 0  AGENTS.md (this file) + the folder's AGENTS.md   rules, map, definition of done
Layer 1  docs/CONTEXT.md                                  folder map of the whole repo
Layer 2  docs/index.md                                    one line per doc — find the owner of a topic
Layer 3  docs/<area>/*.md                                 the topic doc
Layer 4  source + tests                                   the code wins when a doc disagrees — fix the doc
```

| You want… | Go to |
|---|---|
| the next action / how to resume | `docs/project/state.md` |
| status per phase, the todo list | `docs/project/roadmap.md` |
| why something is the way it is | `docs/decisions/index.md` — ADRs are binding; amend, don't re-decide |
| a recurring procedure (add a native API, author a plugin, upkeep sweep) | `docs/contributing/workflows/CONTEXT.md` |
| commands (build, run, test, emulator, env) | `docs/contributing/commands.md` |
| the no-drift rules for docs | `docs/_core/conventions.md` |

## Definition of done

1. `pnpm verify` is green — format check, lint, typecheck, tests, script tests, docs checks
   (`scripts/verify.mjs`; CI's `js` job runs the same steps).
2. Touched Android? also `pnpm verify:android`. Touched Swift or `packages/native`? also
   `pnpm verify:ios` (Swift tests in the `swift:6.4-jammy` container — no Mac needed).
   Device/emulator tiers: `docs/contributing/testing.md`.
3. The docs the change affects are updated in the same change, and `pnpm docs:check` passes.

## Hard rules

- **Format before every commit:** `pnpm format`, then `pnpm format:check` must be clean.
- **Native API shape:** every native API is an interface + a Fake + a platform provider + a handler
  test on the plain JVM / Linux, and registers a **capability version** (OTA gating). Copy an
  existing API (haptics, geolocation, db) — workflow: `docs/contributing/workflows/add-native-api/`.
- **Examples move with the framework:** a change that affects an example updates it in the same
  change; native APIs are demoed in `examples/react-ts`.
- **Public repo:** no machine-absolute paths, secrets, or session notes. Machine paths live in the
  git-ignored `.env.local` (copy `.env.example`).
- **Vendored code is read-only:** never hand-edit `packages/native/*`; use `pnpm update:civetweb`
  / `pnpm update:quickjs` with a release tag.
- **Docs ↔ code stay linked:** a doc names the code it describes (front matter `code:` / `tests:`
  globs) and code names its doc (a `// Docs: docs/<page>.md` header in its first 15 lines);
  `pnpm docs:check` enforces both (rules R1–R4 in
  [`docs/_core/conventions.md`](docs/_core/conventions.md#doc-metadata)), and
  `docs/reference/generated/docs-map.md` lists which pages cover each folder. Docs say what
  things *are*; what changed goes in `docs/project/history.md`.
- **Repetitive commands become scripts** in `scripts/` (Node, OS-agnostic) exposed as `pnpm` scripts.
- **User data lives outside OTA-swappable bundle dirs.**
- **Commits:** Conventional Commits — `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore(deps): …`.

## Where things get recorded

| Change | Update |
|---|---|
| status or a new pending item | `docs/project/roadmap.md` (same change as the code) |
| phase or next action | `docs/project/state.md` |
| end of a work session | append to `docs/project/history.md` (never rewrite entries) |
| a decision | new ADR or dated amendment in `docs/decisions/` |
| doc added / renamed / removed | `docs/index.md` + `mkdocs.yml` nav (case-exact) |
| folder layout | `docs/CONTEXT.md` + the repo map above |
| a package's commands or rules | that package's `AGENTS.md` (+ its `README.md`) |
