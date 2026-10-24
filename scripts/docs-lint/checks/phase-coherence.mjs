// Phase coherence — the check that would have caught the 2026-06 renumber drift.
//
// Only **structured** phase references are inspected: Markdown headers
// (`## Phase N — Title`) and bold table rows (`| **Phase N — Title**` /
// `| **N — Title**`). Free prose like "…, Phase 5 — slotted after iOS…" is
// ignored on purpose.
//
// A reference FAILs only when its title clearly names a DIFFERENT canonical
// phase (a wrong number for a known deliverable, e.g. "Phase 4 — Native APIs"
// when Native APIs is canonical Phase 3). Content headers ("Phase 1 — Done"),
// entry-criteria headers, and unrelated numbered tables (e.g. the adr-003 test
// tiers "Phase 1 — Route/contract") name no canonical deliverable, so they pass.
//
// project/history.md is an append-only log of how things *were* and is skipped entirely.

const HEADER = /^#{1,6}\s+Phase (\d+(?:\.\d+)?)\b\s*[—:-]?\s*(.*)$/
const BOLD_PHASE_ROW = /^\|\s*\*\*Phase (\d+(?:\.\d+)?)\s+[—-]\s+([^*]+?)\*\*/
const BARE_ROW = /^\|\s*\*\*(\d+(?:\.\d+)?)\s+[—-]\s+([^*]+?)\*\*/

export default {
  name: 'phase-coherence',
  run(ctx, report) {
    for (const f of ctx.mdFiles) {
      if (f === ctx.historyPath) continue
      ctx
        .read(f)
        .split('\n')
        .forEach((line, i) => {
          const ln = i + 1
          const m = HEADER.exec(line) || BOLD_PHASE_ROW.exec(line) || BARE_ROW.exec(line)
          if (!m) return
          const n = m[1]
          const title = (m[2] || '').replace(/\*+/g, '').trim()
          if (!title) return

          if (n.includes('.')) {
            report.warn(
              ctx.rel(f),
              ln,
              `decimal phase "Phase ${n}" — phases standardised on integers`
            )
            return
          }
          const canon = ctx.canonical.get(n)
          if (!canon) {
            report.fail(ctx.rel(f), ln, `references Phase ${n}, which the roadmap does not define`)
            return
          }
          if (ctx.compatible(title, canon)) return // names its own phase → fine
          const other = ctx.findCanonMatch(title)
          if (other && other !== n) {
            report.fail(
              ctx.rel(f),
              ln,
              `Phase ${n} titled "${title}" names canonical Phase ${other} ("${ctx.canonical.get(other)}")`
            )
          }
        })
    }

    // Roadmap sequence integrity: integer phases must be 1..N, no gaps/dupes.
    const nums = [...ctx.canonical.keys()]
      .filter((k) => !k.includes('.'))
      .map(Number)
      .sort((a, b) => a - b)
    if (nums.length === 0) {
      report.fail(
        ctx.rel(ctx.roadmapPath),
        0,
        'no canonical phase rows parsed from the roadmap table'
      )
    } else {
      for (let i = 0; i < nums.length; i++) {
        if (nums[i] !== i + 1) {
          report.fail(
            ctx.rel(ctx.roadmapPath),
            0,
            `phase sequence gap/dupe near Phase ${nums[i]} (expected ${i + 1})`
          )
          break
        }
      }
    }
  },
}
