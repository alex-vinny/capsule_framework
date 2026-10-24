// Every doc should be discoverable from index.md (the Layer-2 doc index). A doc
// referenced by neither its relative path nor its bare filename WARNs — likely an
// orphan a reader/agent will never find. Navigation/meta files are exempt.

const EXEMPT = new Set([
  'index.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'MEMORY.md',
  'project/state.md',
  'project/history.md',
])

export default {
  name: 'index-coverage',
  run(ctx, report) {
    const index = ctx.read(ctx.indexPath)
    for (const f of ctx.mdFiles) {
      const r = ctx.rel(f)
      const base = r.split('/').pop()
      if (EXEMPT.has(base) || EXEMPT.has(r)) continue
      // Generated pages are reached from reference/generated/README.md, which index.md lists.
      if (r.startsWith('reference/generated/') && r !== 'reference/generated/README.md') continue
      if (!index.includes(r) && !index.includes(base)) {
        report.warn('index.md', 0, `doc not referenced in index.md: ${r}`)
      }
    }
  },
}
