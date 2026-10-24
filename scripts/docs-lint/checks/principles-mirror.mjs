// The principles.md "Phased Roadmap" table is a mirror of the canonical
// roadmap table. This check fails if the two disagree on any phase title, or if
// a canonical phase is missing from the mirror (WARN). Catches the mirror
// silently drifting out of sync with the roadmap.

const MIRROR_ROW = /^\|\s*\*\*(\d+)\s+[—-]\s+([^*]+?)\*\*/

export default {
  name: 'principles-mirror',
  run(ctx, report) {
    const rel = ctx.rel(ctx.principlesPath)
    const mirror = new Map()
    for (const line of ctx.read(ctx.principlesPath).split('\n')) {
      const m = MIRROR_ROW.exec(line)
      if (m) mirror.set(m[1], m[2].trim())
    }

    for (const [n, title] of mirror) {
      const canon = ctx.canonical.get(n)
      if (!canon)
        report.fail(rel, 0, `mirror lists Phase ${n} ("${title}"), absent from the roadmap`)
      else if (!ctx.compatible(title, canon))
        report.fail(rel, 0, `mirror Phase ${n} = "${title}" ≠ roadmap "${canon}"`)
    }
    for (const [n, title] of ctx.canonical) {
      if (!n.includes('.') && !mirror.has(n))
        report.warn(rel, 0, `roadmap Phase ${n} ("${title}") missing from the principles mirror`)
    }
  },
}
