---
title: "Documentation index"
audience: everyone
status: current
---
# INDEX — docs/ (Layer 2: documentation index)

Source of truth for the framework. Each line below is the canonical doc for its topic — read it
instead of re-deriving from source. Folder map: `CONTEXT.md` (sibling) · repo entry: `../AGENTS.md`.

The tree is organised by **reader**: `guide/` (app developers), `reference/` (lookup),
`concepts/` (explanation), `decisions/` (binding ADRs), `contributing/` (framework contributors),
`project/` (maintainers: plan, state, records).

## guide/ — building an app with Capsule
- `guide/installation.md` — install the framework (app-dev path).
- `guide/quickstart.md` — first app in minutes.
- `guide/hello-world.md` — the annotated hello-world.
- `guide/push-notifications.md` — Push (FCM/APNs): Slice 1 seam done, Slice 2 (Firebase) deferred.
- `guide/database.md` — SQLite `db`: the `sql` tag, transactions, `db.schema` migrations, where data lives.
- `guide/ai.md` — `ai`: tiered on-device / bundled / cloud inference, `availability()`, `prepare()`, streaming.
- `guide/plugins.md` — community integration: bridge protocol, native dispatch, binary+source modes.
- `guide/alerts-styling.md` — alerts styling reference.
- `guide/mobile-css-reset.md` — the ~150-byte mobile CSS reset `capsule build` injects (opt-out `web.mobileReset: false`).
- `guide/publishing.md` — store pipeline (Play/App Store, Fastlane) + OTA two-layer release.
- **`guide/ota-updates.md`** — over-the-air updates with CodeSync: config, publish, channels, rollback, self-host vs hosted, what works today. **Start here for OTA.**

## reference/ — lookup
- `reference/cli.md` — CLI: what each command does and the files it writes (init/add/add-ui/sync/dev/build/run/test/doctor/codesync); options are in `reference/generated/cli.md`.
- `reference/core-api.md` — `@capsule/core` TS API: built modules and their platform behaviour, the error-code registry, and the design spec of planned modules (biometrics, notifications, jobs, …); signatures are in `reference/generated/core/`.
- `reference/lockfile.md` — `capsule.lock` spec: pin resolved native deps for reproducible CI.
- `reference/generated/docs-map.md` — generated: every page's audience, status and the code/tests it documents, plus which pages cover each source folder.

## concepts/ — how and why it works
- `concepts/architecture.md` — foundation: monorepo, `@capsule/core`, `capsule-android` AAR.
- `concepts/principles.md` — core tenets: native shell as binary dep, plugin/core boundary, interface-first.
- `concepts/capsule-vs-ionic-capacitor.md` — comparison vs Capacitor/Cordova.
- `concepts/extensibility-and-positioning.md` — pre-ADR: thin-core vs batteries-included debate.
- `concepts/ionic-framework7-migration.md` — UI migration is orthogonal to the runtime.
- `concepts/primers/index.md` — native onboarding for C#/TS devs, mapped to real Capsule files:
  `concepts/primers/kotlin-for-csharp-devs.md` · `concepts/primers/jni-and-cpp.md` ·
  `concepts/primers/civetweb.md` · `concepts/primers/quickjs.md`

## decisions/ — binding (never decided twice)
- `decisions/index.md` — the ADR list with status; `000N` = the `adr-00N` cited across the docs.
- **`decisions/0001-embedded-runtime.md`** — embedded HTTP server + QuickJS on-device runtime (accepted; server library now CivetWeb per 0004).
- **`decisions/0002-capsule-ui.md`** — native-look component layer, Tailwind + iOS/Material preset (proposed).
- **`decisions/0003-ai-and-agents.md`** — on-device AI + agent tools, OTA-updatable agent logic (proposed; Tier-1 spike built).
- **`decisions/0004-web-serving-transport.md`** — loopback HTTP server on both platforms (rejects WKURLSchemeHandler/https); tiered HTTP fidelity, WS/SSE deferred-by-design; 2026-10-24 amendment: CivetWeb on both platforms.
- `decisions/log.md` — consolidated API/implementation decisions (SDK SLA, monolithic core).

## contributing/ — working on the framework
- `contributing/index.md` — how to contribute (pointer to the root CONTRIBUTING, CoC, security).
- **`contributing/commands.md`** — command reference: setup (`.env.local`, `pnpm dev:env`), TS/Kotlin/Gradle/Swift build & test, `pnpm verify`.
- `contributing/environment.md` — env setup (app dev / framework creator / contributor).
- `contributing/testing.md` — test harness tiers (route-contract → units → QuickJS-fidelity → e2e) + the manual test plan.
- `contributing/ci.md` — GitHub Actions: js · android · android-instrumented (opt-in) · ios-linux · ios-macos; local equivalents.
- `contributing/docker.md` — Docker image family for dev & app builds.
- `contributing/codesync-internals.md` — OTA internals: bundle ZIP, publish flow, self-hosted server, wire protocol, device client, crash-loop rollback, known gaps, planned cloud design.
- `contributing/plugin-authoring.md` — guide for third-party SDK-wrapper authors.
- `contributing/template-authoring.md` — author a `capsule init` template (anatomy/contract, manifest, custom sources). **Canonical for `templates/`.**
- `contributing/ios-bring-up.md` — iOS bring-up without Mac hardware (Phase 4); contract-readiness audit + web-serving rationale.
- `contributing/platform-parity.md` — Android ↔ iOS parity map (shared vs re-coded vs platform edge).
- `contributing/upkeep.md` — dependency/tooling audit: version sources, baseline pins (CivetWeb, QuickJS), sweep log.
- `contributing/release.md` — public GitHub + npm/Maven release: decisions D1–D6 and the pre-publish checklist (distinct from store publishing).
- `contributing/workflows/CONTEXT.md` — recurring procedures (Inputs → Process → Outputs):
  `contributing/workflows/add-native-api/` · `contributing/workflows/author-plugin/` · `contributing/workflows/upkeep-sweep/`

## project/ — plan, state and records
- **`project/roadmap.md`** — phase-sequenced plan + current status. *Start here for "what's done".*
- **`project/state.md`** — where the project is *now*: current phase, next action, how to resume.
- `project/history.md` — append-only chronological build log.
- `project/known-issues.md` — known design gaps + recommended solutions (severity-graded).
- `project/incidents/2026-10-embedded-server-startup.md` — embedded-server bind-race analysis, fix plan, resolution (CivetWeb).
- `project/research/2026-06-24-planning-brainstorm.md` — sequencing notes (Firebase, Local Notifications next).
- `project/research/chatgpt-plugin-compatibility.md` — strategy: do NOT reimplement a Capacitor runtime.
- `project/research/chatgpt-first-impressions.md` — external review feedback.
- `project/infrastructure.md` — infra economics: bandwidth-dominated OTA cost, R2/Hetzner; the maintainer's hosted setup.
- `project/business/business-model.md` — open-core SaaS: free framework, managed OTA cloud as revenue.
- `project/business/pricing.md` — tiers Community→Enterprise, metered on MAU + bandwidth (never deploy count).
- `project/business/ota-policy-and-liability.md` — store compliance, capability gating, tool-vendor liability.
- `project/server-design/overview.md` — Capsule Portal & CodeSync: orgs, apps, API keys, cloud + self-hosted modes.
- `project/server-design/database.md` — PostgreSQL schema: organizations, apps, api_keys, channels, bundles, rollouts, devices.
- `project/server-design/file-storage.md` — content-addressed bundle storage (SHA-256, MinIO/R2, diff download).
- `project/server-design/workers.md` — BullMQ/Redis background jobs: push delivery, bundle processing.

## _core/
- `_core/conventions.md` — ICM no-drift rules governing this layer.

## Packages — files map (Layer 4 entries)

Each package has a README; the canonical product docs live in this index.

| Package | What | Canonical doc |
|---|---|---|
| `../packages/core/` | app-facing TS API (interface + provider + Fake per API) | `concepts/architecture.md`, `reference/core-api.md` |
| `../packages/cli/` | `capsule` CLI (init/add/add-ui/sync/dev/build/run/doctor + OTA) | `reference/cli.md` |
| `../packages/capsule-android/` | Android native shell (Kotlin + C AAR) | `decisions/0001-embedded-runtime.md` |
| `../packages/capsule-ios/` | iOS native shell (SwiftPM — manifest at the repo-root `Package.swift`, Docker-tested) | `../packages/capsule-ios/README.md` |
| `../packages/native/civetweb/` | vendored CivetWeb — the embedded HTTP server both shells compile | `concepts/primers/civetweb.md` |
| `../packages/native/quickjs/` | vendored QuickJS-ng — the on-device JS engine | `concepts/primers/quickjs.md` |
| `../packages/ui-kit/` | Capsule UI class builders, copied into apps by `capsule add-ui` | `decisions/0002-capsule-ui.md` |
| `../packages/codesync-api/` | self-hostable CodeSync delivery server (Fastify, AGPL-3.0) | `contributing/codesync-internals.md`, `project/server-design/overview.md` |
| `../examples/` | demo apps (own nested pnpm workspace) | `../examples/CONTEXT.md` |
