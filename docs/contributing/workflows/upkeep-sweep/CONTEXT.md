---
title: "Workflow: upkeep sweep"
audience: maintainer
status: current
code:
  - scripts/upkeep/**
---
# CONTEXT — upkeep-sweep (stage contract)

Periodic dependency/tooling audit. The hard part is that versions are pinned in **three
places that must move in lockstep** — miss one and generated projects drift from the AAR.
Area index: `../CONTEXT.md`.

## Inputs (load these first)

| Source | Why |
|--------|-----|
| `../../upkeep.md` | The whole procedure: three version sources, baseline pins, per-sweep checklist, sweep log, cadence. This workflow is a thin pointer to it. |
| `../../testing.md` | Tiers to run if a bump is applied. |

## The three version sources (keep in lockstep)

1. **Library catalog** (the AAR's own build) — `capsule/packages/capsule-android/gradle/libs.versions.toml`, `…/capsule/build.gradle.kts`, `gradle/wrapper/gradle-wrapper.properties`.
2. **CLI generator** (what `capsule sync`/`init` emit) — `capsule/packages/cli/src/sync/sync.ts`, `…/commands/init.ts`, `…/testing.ts`. **Duplicates #1 as template strings — the #1↔#2 lockstep is the main trap.**
3. **Templates** (web starters) — `templates/*/package.json`.

## Process (ordered)

1. **Check latest** per `110` §"Per-sweep checklist": QuickJS-ng, CivetWeb (release tags + advisories), Android SDK + Play `targetSdk` deadline, Gradle/AGP/Kotlin/NDK (as a compatibility unit), CLI/core deps (`pnpm outdated`, `pnpm audit`), template framework majors.
2. **Classify** each finding: 🟢 current / 🟡 optional / 🔴 security or forced platform requirement.
3. **Log** → append a row to the Sweep log in `../../upkeep.md` (Date · By · areas · findings · action). **Always log, even on a no-action sweep.**
4. **(🔴 only) Apply bump** → edit source #1, **mirror into #2**, then #3; rebuild affected packages.
5. **AUDIT** → run all test tiers (`testing.md`); if native/Kotlin/Gradle changed, rebuild the AAR (stale-AAR rule). Commit per-repo, `chore(deps):`.

## Outputs

Always: updated Sweep log in `../../upkeep.md`. On a bump: the touched files across
the three sources above.

## Checkpoints (human)

- No-action sweep is a valid outcome — the log entry is the deliverable.
- Bumps that touch native code → **hand the device/instrumented test to the user**.
- Cadence (`110` §"Cadence"): quarterly, at each phase kickoff, before any release, and
  immediately on a known CVE or Play enforcement date.
