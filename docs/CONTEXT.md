---
title: "Context map"
audience: contributor
status: current
---
# CONTEXT — Capsule Framework (Layer 1: the map)

> **Canonical, version-controlled copy — lives in this repo** (`capsule/` is the public
> monorepo and owns the documentation). Paths below are relative to `docs/`; `../` = repo root.

Capsule is an open-core mobile framework: ship any web bundle inside a generated native
shell, with an on-device runtime (CivetWeb + QuickJS) and OTA code push (CodeSync).

> **Layer model (ICM).** Read top-down, stop when you have enough:
> Layer 0 `../AGENTS.md` (entry + rules) → Layer 1 this file (folder+package map) →
> Layer 2 `index.md` (every doc) → Layer 3 individual docs → Layer 4 source
> (`../packages/*/`). References only ever point *down*.

## Top-level dirs (this repo)

| Dir | Lang(s) | What it is | Canonical docs |
|-----|---------|------------|----------------|
| `../packages/` | TS · Kotlin · Swift · C | The product itself (pnpm + turbo monorepo) — see the package map below | each `packages/*/README.md` |
| `./` (`docs/`) | Markdown | Source of truth for everything — guide, reference, concepts, decisions, contributing, project | **`index.md`** (full doc index) |
| `../examples/` | JS/TS + frameworks | Working demo apps (template variants + multi-bundler) — own nested pnpm workspace, apps link `packages/core` | `../examples/CONTEXT.md` |
| `../scripts/` | Node (`.mjs`) | Contributor tooling as root `pnpm` scripts: `dev:env`, `with-env`, `dev:emulator`, `dev:examples`, `update:quickjs`, `update:civetweb`, `verify`, `docs:check`, `docs:lint` (machine paths in a git-ignored `.env.local`, see `../.env.example`) | `contributing/commands.md` |
| `../.github/` | YAML | CI (`ci.yml`: js · android · android-instrumented · ios-linux · ios-macos) + docs deploy | `contributing/ci.md` |

## Sibling repo (*outside* this repo)

| Repo | Lang(s) | What it is | Canonical docs |
|------|---------|------------|----------------|
| `templates` (`github:alex-vinny/capsule-templates`) | JS/TS + frameworks | `giget` scaffold sources for `capsule init` (7 framework templates + manifest) — separate because templates churn much faster than the framework | `contributing/template-authoring.md` (canonical) |

## Package map (Layer 4 entry points)

| Package | What it is | Key entry points | Build & test | Canonical docs |
|---|---|---|---|---|
| `../packages/core/` | App-facing TS API running inside the web layer; every API = interface + provider + Fake | `src/index.ts`, `src/bridge.ts`, `src/web-bridge.ts`, one file per API (`camera.ts`, `filesystem.ts`, `network.ts`, `app.ts`, `push.ts`, …) | `pnpm --filter @capsule/core run build` / `test` (vitest) | `concepts/architecture.md`, `reference/core-api.md` |
| `../packages/cli/` | `capsule` CLI: init/add/add-ui/sync/dev/build/run/doctor + OTA (`codesync`) | `src/index.ts` (registration), `src/commands/` (one per command), `src/lib/` (`ui-kit.ts`, `zip.ts`), `src/config.ts` (`codeSync` block) | `pnpm --filter @capsule/cli run build` / `test` | `reference/cli.md` |
| `../packages/capsule-android/` | Android native shell (Kotlin + C/C++, AAR) hosting CivetWeb + QuickJS | `capsule/src/main/kotlin/dev/capsule/` (`CapsuleActivity.kt`, `CapsuleBridge.kt`, `handlers/`, …), `capsule/src/main/cpp/` | `gradlew assembleRelease` / `test` / `connectedDebugAndroidTest` | `decisions/0001-embedded-runtime.md`, `contributing/testing.md`, `contributing/ci.md` |
| `../packages/capsule-ios/` | iOS native shell (SwiftPM, manifest at the repo-root `Package.swift`; WKWebView + CivetWeb server, adr-004) | `Sources/dev/capsule/` (`CapsuleViewController.swift`, `runtime/`, `codesync/`, …), `Tests/CapsuleTests/` | `swift test` from the repo root (Docker: `swift:6.4-jammy`) / `xtool build` | `packages/capsule-ios/README.md`, `contributing/ios-bring-up.md`, `contributing/codesync-internals.md` |
| `../packages/native/quickjs/` | Vendored QuickJS-ng (C) — the on-device JS engine | `quickjs.c`, `quickjs.h`, `VERSION` (pinned tag), `README.md` | `node scripts/update-quickjs.mjs [tag]` (re-vendor); built by the Android CMake | `concepts/primers/quickjs.md`, `decisions/0001-embedded-runtime.md` |
| `../packages/native/civetweb/` | Vendored CivetWeb (C) — the embedded HTTP server compiled into both shells | `src/civetweb.c`, `include/civetweb.h`, `VERSION` (pinned tag), `README.md` (build flags) | `node scripts/update-civetweb.mjs [tag]` (re-vendor); built by the Android CMake and the `CCivetweb` SwiftPM target | `concepts/primers/civetweb.md`, `decisions/0004-web-serving-transport.md` |
| `../packages/ui-kit/` | Capsule UI — framework-agnostic Tailwind class builders + iOS/Material presets | `src/index.ts`, `src/tokens.ts`, `src/components/*.ts` (copied into apps by `capsule add-ui`) | `pnpm --filter @capsule/ui-kit run build` / `test` | `decisions/0002-capsule-ui.md`, `reference/cli.md` (add-ui) |
| `../packages/codesync-api/` | Self-hostable CodeSync delivery server (Fastify, file-based, AGPL-3.0) | `src/index.ts` (all routes), `api-spec.yaml` (OpenAPI), `storage/` (runtime, gitignored) | `pnpm --filter @capsule/codesync-api run build` / `start` (needs `CODESYNC_API_KEY`) | `contributing/codesync-internals.md`, `project/server-design/overview.md` |

## Where to go next

- **Entry point / rules (task, target, files, navigation)** → `../AGENTS.md`
- **Where are we now / how to resume** → `project/state.md`
- **Authoritative status & roadmap** → `project/roadmap.md`
- **Why decisions were made** → `decisions/index.md` (ADRs 0001–0004)
- **How to build / run / test** → `contributing/commands.md`, `contributing/environment.md`
- **Machine setup + contributor scripts** → `contributing/commands.md` (`.env.local`, `pnpm dev:env`, `pnpm verify`)
- **Recurring procedures** (add a native API, author a plugin, upkeep sweep) → `contributing/workflows/CONTEXT.md`
- **Repo conventions / no-drift rules** → `_core/conventions.md`
- **The full doc-by-doc index** → **`index.md`** — go there before opening any single doc.
