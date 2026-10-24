# docs-lint

A small, **zero-dependency** consistency validator for the Capsule `docs/` tree — the deeper
companion to `pnpm docs:check` (which checks the mkdocs nav and the map-level links). Born out of
the 2026-06 phase renumber, where three historical phase numberings had drifted across ~10 docs
and were only caught by hand.

> No install, no build step — Node built-ins only.

## Run it

```sh
pnpm docs:lint            # report + exit 1 on any FAIL
pnpm docs:lint --strict   # promote WARN → FAIL
node scripts/docs-lint/bin/docs-lint.mjs --docs <path-to-docs>   # another docs tree
```

The docs dir defaults to the repo's `docs/`; override with `--docs <path>` or `CAPSULE_DOCS_DIR`.
Exit codes: `0` clean · `1` failures · `2` bad invocation.

## What it checks

| Check | Level | What it catches |
|-------|-------|-----------------|
| **links** | FAIL (broken file) · WARN (anchor) | Relative `[..](path.md)` / `#anchor` targets that don't resolve. |
| **phase-coherence** | FAIL | A structured `Phase N — Title` (header/table row) whose title names a *different* canonical phase — e.g. "Phase 4 — Native APIs" when Native APIs is Phase 3. Also: roadmap sequence must be `1..N` with no gaps/dupes; decimal phases (`Phase 4.5`) WARN. |
| **principles-mirror** | FAIL | The `concepts/principles.md` phase table disagreeing with the canonical roadmap table. |
| **index-coverage** | WARN | A doc not referenced anywhere in `index.md` (likely orphaned). |

**Source of truth:** the phase table in `project/roadmap.md`. Everything else is
checked *against* it. `project/history.md` (append-only log) is exempt from phase checks.

### Deliberately not flagged

To stay low-noise, `phase-coherence` only inspects **structured** references
(Markdown headers and bold table rows) and only fails on a *cross-collision*
(title clearly names a different canonical phase). Content headers
("Phase 1 — Done"), entry-criteria headers, prose em-dashes, and unrelated
numbered tables (e.g. the adr-003 4-tier test table) are intentionally ignored.

## Layout

```
docs-lint/
  bin/docs-lint.mjs       # CLI: arg parsing, runs checks, prints, exits
  lib/
    context.mjs           # file walk, readers, canonical phase map, title matching
    report.mjs            # findings collector + console reporter
  checks/
    links.mjs
    phase-coherence.mjs
    principles-mirror.mjs
    index-coverage.mjs
```

## Add a check

Drop a module in `checks/` exporting `{ name, run(ctx, report) }` and register it
in the `CHECKS` array in `bin/docs-lint.mjs`. Use `report.fail(file, line, msg)` /
`report.warn(...)`; `ctx` gives you `mdFiles`, `read(f)`, `rel(f)`, `anchors`,
`canonical` (phase map), and the `compatible` / `findCanonMatch` title helpers.
