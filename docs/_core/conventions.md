---
title: "Documentation conventions"
audience: contributor
status: current
code:
  - scripts/docs-check.mjs
  - scripts/docs-lint/**
  - scripts/gen/docs-map.mjs
tests:
  - scripts/docs-lint/**/*.test.mjs
---
# CONVENTIONS — ICM no-drift rules

How the AI-navigability layer is kept correct over time. These are the
Interpreted Context Methodology (ICM) principles adapted to this repo. When the
layers and the code disagree, the code wins — fix the layer.

## Principles

1. **One stage, one job.** Each `CONTEXT.md` / workflow folder covers a single
   concern. Don't grow a god-doc.
2. **Plain text as interface.** Markdown only. No tooling required to read a layer.
3. **Layered context, read top-down.** `../../AGENTS.md` + the folder's own `AGENTS.md` (L0) →
   `../CONTEXT.md` (L1) → `../index.md` + per-area `CONTEXT.md` (L2) → individual doc (L3) →
   source (L4). An agent stops reading as soon as it has enough.
   **`AGENTS.md` is the only agent entry point.** Tool-specific files (`CLAUDE.md`, `GEMINI.md`,
   `.github/copilot-instructions.md`) are one- or two-line pointers to it with no content of their
   own, so there is nothing to drift. Every package (`packages/*`), `examples/` and `scripts/`
   has a nested `AGENTS.md` — what it is, entry files, the exact test command, local rules, which
   docs describe it — and points to its `README.md` for the file map instead of repeating it.
4. **Configure the factory, not the product.** Workflows describe *how to do a
   recurring task*; they don't hold the task's one-off output.
5. **Automate the repetitive.** Any command run repeatedly — especially multi-step or
   multi-directory (e.g. "for every example…") — becomes a Node script in the repo's
   `scripts/` exposed as a root `pnpm` script (`pnpm dev:*`, `pnpm update:*`), never a manual
   loop pasted into prose. Docs *point to* the script; the script is the single source of the
   shortcut. Scripts are OS-agnostic (Node built-ins only, `scripts/lib/env.mjs` for per-OS
   executables) and read machine paths from the git-ignored `.env.local` — never hard-coded.

## Reference rules

- **One canonical source per fact.** Each topic is owned by exactly one doc
  (see `../index.md`). Everywhere else *points* to it — never restates it.
- **References point downward only.** L0→L1→L2→L3→L4. The single allowed upward
  pointer is a child `CONTEXT.md` naming its parent map. No cycles.
- **No duplication.** If you're tempted to copy a paragraph, link instead. A fact
  in two places will drift; a link can't.
- **Specs are contracts.** Spec docs (ADRs, `core-api.md`, `lockfile.md`)
  define *constraints*, not implementation. Implementation lives in source.

## Layer budgets (soft targets)

| Layer | File | Target |
|-------|------|--------|
| 0 | `../../AGENTS.md` | ≤ ~1,500 tokens — map, read order, definition of done, hard rules |
| 0 | nested `AGENTS.md` | 20–60 lines — local rules + test command; file maps stay in the README |
| 1 | `../CONTEXT.md` | ~300 tokens — the map, nothing more |
| 2 | `../index.md`, per-area `CONTEXT.md`, `../contributing/workflows/*/CONTEXT.md` | one-liners + contract |

## Workflow stage contracts

Each `contributing/workflows/<name>/CONTEXT.md` is a contract with three sections:

- **Inputs** — table of which files/layers to load (point to exact docs).
- **Process** — ordered steps; mark human **checkpoints** and quality **audits**.
- **Outputs** — what is produced and where (usually edits to source + docs, not a
  new artifact folder — this is a product repo, not a content pipeline).

`output/` folders, when a workflow needs one, carry a `.gitkeep` and are
git-ignored — structure is versioned, generated artifacts are not.

## Doc metadata

Docs and code point at each other, and `pnpm docs:check` keeps both directions true. The map
of every page and the folders it covers is generated: [docs-map](../reference/generated/docs-map.md)
(`pnpm gen`).

**Front matter.** Every page under `docs/` except `reference/generated/` starts with:

```yaml
---
title: "Database (SQLite)"      # quoted; used for the browser tab and search
audience: app-developer         # app-developer | contributor | maintainer | everyone
status: current                 # current | planned | draft | record
code:                           # optional: repo-relative globs of the source this page documents
  - packages/core/src/db.ts
  - packages/capsule-android/capsule/src/main/kotlin/dev/capsule/db/**
tests:                          # optional: the tests that pin that behaviour
  - packages/core/src/__tests__/db.test.ts
---
```

- `status`: `current` describes what is built; `planned` is a design not built yet; `draft` is
  unsettled or exploratory; `record` is history kept as written (ADRs, the decision log, history,
  research, incidents). The site marks `planned`, `draft` and `record` pages in the navigation.
- Globs are repo-relative with forward slashes and start with a path segment. `**` matches any
  number of folders, `*` stays within one, `?` is one character. List the files a reader would
  open, not the whole package. Keep the page's `#` heading; `title` doesn't replace it.

**Code header.** A source file names the doc that explains it in a comment within its first 15
lines, in its language's comment style:

```ts
// Docs: docs/guide/database.md
```

The value is one or more comma-separated repo-relative doc paths, each optionally with an
`#anchor`. Headers are read in `packages/`, `scripts/` and `examples/*/src/`, never in the
vendored sources under `packages/native/civetweb` and `packages/native/quickjs`.

**Checks** (`scripts/docs-check.mjs`; the parser and glob matcher are in
`scripts/docs-lint/lib/meta.mjs`):

| Rule | Checks | Level |
|------|--------|-------|
| R1 | every page has front matter with a valid `title`, `audience` and `status`, and no unknown keys | error |
| R2 | every `code:` / `tests:` glob matches at least one file, so a page can't keep pointing at deleted code | error |
| R3 | every code header points at an existing doc, and at an existing heading when it has an `#anchor` | error |
| R4 | a file matched by a page's `code:` globs that has a header which doesn't list that page | warning |

When you move or delete code, update the globs that pointed at it (R2 tells you which). When a
file gets a header, list every page whose `code:` covers it (R4).

## When you change the code

- New doc → put it in the folder for its reader (`guide/` app developers · `reference/` lookup ·
  `concepts/` explanation · `decisions/` ADRs · `contributing/` framework contributors · `project/`
  maintainers), name it in descriptive kebab-case (numbers only for ADRs and dated records), give it
  [front matter](#doc-metadata), add its one-line entry to `../index.md` and its `mkdocs.yml` nav line.
- New top-level area or hard rule → update `../CONTEXT.md` / `../../AGENTS.md` (its repo map too).
- Changed a package's commands, entry files or local rules → update that package's `AGENTS.md`
  in the same change. A new package gets its own `AGENTS.md` and a row in the root repo map.
- New recurring multi-step procedure → add `../contributing/workflows/<name>/CONTEXT.md`.
- New reusable script/tool → drop it in `../../scripts/` (Node, header comment with usage), add a root `pnpm` script, and list it in `contributing/commands.md`; any new machine path goes in `.env.example`.
- **Phase or next-action changed** → update `../project/state.md` (the pointer only; status detail stays in `project/roadmap.md`).
- **End of a work session** → append an entry to `../project/history.md`; never rewrite past entries.
- Moved/renamed/deleted a doc → fix every pointer to it (grep the slug first).
