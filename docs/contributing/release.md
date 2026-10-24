---
title: "Release"
audience: maintainer
status: current
code:
  - LICENSE
  - NOTICE
  - packages/codesync-api/LICENSE
---
# Capsule Framework — OSS / Package Release

> **Scope:** publishing the *framework itself* — the public GitHub repos and the distributable
> packages (npm + Maven AAR). This is **not** app-store publishing — that's
> [publishing.md](../guide/publishing.md) (Play/App Store via Fastlane). Two different meanings of "publish".
>
> Status: **D1–D4 decided (2026-10-24)**; D5 (registries) and D6 (iOS caveat) open. This doc is the
> pre-publish gate for the first public push and, later, the package releases.

## State (2026-10-24)

- Product code has **no hardcoded absolute paths**; `gradlew` is cross-platform; CI is
  GitHub Actions on Linux + macOS ([ci.md](ci.md)).
- Contributor tooling is OS-agnostic Node (`scripts/*.mjs` as root `pnpm` scripts, machine paths in a
  git-ignored `.env.local`) — the old PowerShell `scripts/` repo is retired.
- The remaining "works on my machine" friction is **`CAPSULE_SHELL_OVERRIDE_PATH`**: until the AAR is
  published (D5), a developer builds the AAR locally and the CLI points at it.

## Decisions

### D1 — Target & timing: public GitHub now ✅
- **Public repos on GitHub (`alex-vinny`) now**, not a private Azure DevOps phase first.
- Why: public repos get **free GitHub-hosted macOS runners**, which removed the only reason for the
  private-Azure plan (1:1 macOS minutes while private).
- **Fresh history:** each public repo starts from a single initial commit (the private history,
  which carried a work email and pre-cleanup docs, is archived privately). Commit author: the
  GitHub **noreply** address. After the first push, history is never rewritten.

### D2 — What is public ✅
- **Everything public**, docs included — business model, pricing, server design and infrastructure
  notes too (no secrets in them; the maintainer's own cluster names stay generic).
- **`capsule_framework`** (repo; the folder is `capsule/`) is the monorepo: framework, docs and **`examples/`** (folded in — demos change with the
  framework, so they land in the same PR and CI can run them).
- **`capsule-templates`** stays a separate public repo: templates churn much faster, and
  `capsule init` fetches them with giget (`github:alex-vinny/capsule-templates/<name>`).
- The PowerShell **`scripts`** repo is retired (see D4.1).
- The repo reads standalone: root `README.md`, `AGENTS.md`, `CONTRIBUTING.md`.

### D3 — License model (open-core) ✅
- Framework (`capsule`, `examples`, `templates`): **Apache-2.0** (patent grant).
- **`packages/codesync-api`: AGPL-3.0** — anyone can self-host the OTA server; a modified version
  offered as a hosted service must publish its changes. The maintainer's hosted CodeSync is the
  paid offer ([business model](../project/business/business-model.md)).
- Done: `LICENSE`, `NOTICE` (third-party: CivetWeb, QuickJS-ng — MIT), `CONTRIBUTING.md`,
  `SECURITY.md` (GitHub private vulnerability reporting), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  `license` fields in every `package.json`.

### D4 — OS independence
1. ✅ **Dev scripts ported to Node** — `pnpm dev:env`, `pnpm with-env`, `pnpm dev:emulator`,
   `pnpm dev:examples`, `pnpm update:quickjs`, `pnpm update:civetweb`, `pnpm verify` ([commands.md](commands.md)).
   The OTA bundle ZIP is built in-process (`archiver`), not with PowerShell.
2. ⬜ **Kill `CAPSULE_SHELL_OVERRIDE_PATH`** by resolving the AAR from Maven (D5).
3. ⬜ Pin the toolchain with **mise** (or asdf): node/pnpm/java in one file.
4. ⬜ **Devcontainer** matching the ubuntu CI for the Android SDK/NDK. The emulator still needs KVM
   (Linux host), so device work stays local.
- **Nix:** not first — `androidenv` is fiddly; `devbox` is the gentler option if wanted later.

### D5 — Package registries: npm + Maven go together (open)
They're the two halves of "install without cloning the repo":
- **npm** → publish `@capsule/cli`, `@capsule/core`, `@capsule/ui-kit` to **npmjs.org** so
  `capsule init` / installs resolve real versions. (Check the `@capsule` scope is available first.)
- **Maven** → publish the Android **AAR** to **Maven Central** (GitHub Packages as an interim) so the
  shell resolves as a normal Gradle dependency — the fix for D4.2.
- **Never commit registry tokens.** A committed `.npmrc` holds only non-secret config; auth comes from
  CI secrets (`NPM_TOKEN`) / Maven credentials in the environment.
- **Version placeholder reconciled (2026-10-24):** templates ask for `@capsule/core ^0.1.0`, the real
  version. `capsule init` still cannot resolve it until the package is on npm.

### D6 — iOS is not a blocker (open caveat)
- Nothing technical blocks an **Android-first** release: the iOS embedded server, `db` and `ai`
  providers are built and tested on Linux + macOS CI; the WKWebView shell is Phase 4.
- Label early releases clearly (alpha, Android-first, iOS in bring-up).

## Pre-publish checklist (before the first public push)

- [x] **D1 target chosen** — public GitHub now, fresh single-commit repos, noreply author.
- [x] **Docs decision** (D2) — everything public; examples in the monorepo; templates separate.
- [x] **Standalone README + LICENSE/NOTICE + CONTRIBUTING/SECURITY/CODE_OF_CONDUCT** (D3).
- [x] **Dev scripts ported to Node** (D4.1); OTA ZIP no longer needs PowerShell.
- [x] **CI on GitHub Actions** (Linux + macOS, [ci.md](ci.md)).
- [ ] **Secret scan of the tree** — `gitleaks detect --no-git` on each repo right before its initial
      commit (fresh history means only the files themselves need scanning).
- [x] **Reconcile package versions** (D5) — templates ask for `@capsule/core ^0.1.0`.
- [x] **Template source in the CLI** → `github:alex-vinny/capsule-templates/<name>`.
- [ ] **Publish pipeline** — npm + Maven AAR publish jobs (D5); until then keep the local
      `CAPSULE_SHELL_OVERRIDE_PATH` path documented.
- [ ] **Contributor onboarding extras** — devcontainer / mise (D4.3–4).

## Pointers
- Store publishing (different topic) → [publishing.md](../guide/publishing.md)
- Phase sequencing → [roadmap.md](../project/roadmap.md)
- Dependency reconciliations that overlap D5 → [upkeep.md](upkeep.md)
- CI → [ci.md](ci.md), `.github/workflows/ci.yml`
