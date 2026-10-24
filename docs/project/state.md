---
title: "Project state"
audience: contributor
status: current
---
# STATE — where the project is right now

> The at-a-glance "you are here." **Authoritative status is owned by `project/roadmap.md`** —
> this file only names the current phase, the next action, and how to resume, then points down.
> Past sessions are logged in `project/history.md`. Keep this short; don't duplicate the roadmap.

## Current phase

**Phase 3 — Native APIs Expansion** (capability-first; precedes iOS and the OTA cloud).
Per-API status (done / next) is the roadmap's job: **`project/roadmap.md` → "Next steps"**.

**Also in flight (status in the roadmap):** Phase 4 iOS bring-up is interface-first done
(Tier 1–4 drafts in `packages/capsule-ios/drafts/`; the embedded server, `db` and `ai`
providers are real, Linux-tested code — 89 Swift tests; integration needs a Mac);
Phase 5 Capsule UI foundation is committed (`packages/ui-kit` — framework-agnostic class
builders, 15/15 tests green).

**Pulled ahead — Phase 6 CodeSync local delivery:** the file-based server is done
(`packages/codesync-api`, E2E-verified); the CLI `codesync publish` command and the on-device
fetch client are next (see the roadmap's Phase 6 item).

## Next action

The repo is public (`alex-vinny/capsule_framework`); the 2026-10-24 work is verified on an API 36
emulator (`project/history.md` → 2026-10-24). Next: a **physical-device** pass (SR-4 repeat, Gemini
Nano on a supported phone), then the first Phase 6 work — the OTA known gaps
(`contributing/codesync-internals.md` → Known gaps) — and iOS bring-up on the macOS runner.

## Resume a session

```sh
cp .env.example .env.local   # first time only — then set JAVA_HOME, ANDROID_HOME, AVD_NAME, …
pnpm dev:env                 # show the resolved environment (JDK, SDK, AAR override, adb)
adb devices                  # expect a device/emulator (pnpm dev:emulator start boots one)
```

CodeSync (Phase 6) work: from `capsule/packages/codesync-api`, set any non-empty
`CODESYNC_API_KEY` env var (dev) and `pnpm run build` after edits — server runs on port 3000.

## Pointers

| For… | Go to |
|------|-------|
| Authoritative phase/status | `project/roadmap.md` |
| Why decisions were made | `decisions/index.md` (0001–0004) |
| How to build / run / test | `contributing/commands.md`, `contributing/testing.md` |
| Env setup (machine paths) | `.env.example` → `.env.local` (repo root), `contributing/commands.md` §0, `contributing/environment.md` |
| Recurring procedures | `contributing/workflows/CONTEXT.md` |
| What happened before | `project/history.md` |

> Update this file only when the **phase** or **next action** changes — not every session
> (that's what `project/history.md` is for).
