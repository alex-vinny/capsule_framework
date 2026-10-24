// Node: `pnpm outdated` and `pnpm audit` for the framework workspace (and, with --examples, the
// separate examples workspace). Both only read; outdated exits 1 when anything is behind, so the
// exit code is ignored and the JSON is what counts.

import { STATUS, row, unavailable, versionRow } from '../lib/report.mjs'
import { parseAudit, parseOutdated } from '../parsers/pnpm.mjs'
import { PATHS } from '../repo.mjs'

const SEVERE = new Set(['critical', 'high'])

/** First JSON value in a command's stdout (pnpm may print a warning line before it). */
export function extractJson(stdout) {
  const start = stdout.search(/[[{]/)
  if (start < 0) return undefined
  return JSON.parse(stdout.slice(start))
}

export function outdatedRows(entries, label) {
  return entries.map((e) => {
    const where = e.dependents.length > 0 ? ` in ${e.dependents.join(', ')}` : ''
    const r = versionRow({
      name: `${e.name}${label ? ` (${label})` : ''}`,
      current: e.current,
      latest: e.latest,
      source: `https://www.npmjs.com/package/${e.name}`,
      note: `${e.dependencyType}${where}${e.wanted && e.wanted !== e.current ? `; in range: ${e.wanted}` : ''}`,
    })
    if (e.deprecated) Object.assign(r, { status: STATUS.yellow, note: `deprecated — ${r.note}` })
    return r
  })
}

export function auditRows(advisories, label) {
  return advisories.map((a) =>
    row({
      name: `${a.module}: ${a.id}${label ? ` (${label})` : ''}`,
      current: a.vulnerable,
      latest: a.patched,
      status: SEVERE.has(a.severity) ? STATUS.red : STATUS.yellow,
      note: `${a.severity} — ${a.title}${a.paths.length > 0 ? ` (via ${a.paths.slice(0, 2).join('; ')})` : ''}`,
      source: a.url,
    })
  )
}

async function workspaceRows(ctx, cwd, label) {
  const rows = []
  try {
    const out = ctx.exec('pnpm', ['outdated', '-r', '--format', 'json'], { cwd })
    const json = extractJson(out.stdout)
    if (json === undefined && out.status !== 0)
      throw new Error(out.stderr.trim().split('\n')[0] || `pnpm outdated exited ${out.status}`)
    const found = outdatedRows(parseOutdated(json ?? {}), label)
    rows.push(
      ...(found.length > 0
        ? found
        : [
            row({
              name: `npm dependencies${label ? ` (${label})` : ''}`,
              status: STATUS.green,
              note: 'all current',
            }),
          ])
    )
  } catch (error) {
    rows.push(unavailable(`pnpm outdated${label ? ` (${label})` : ''}`, error))
  }
  try {
    const out = ctx.exec('pnpm', ['audit', '--json'], { cwd })
    const json = extractJson(out.stdout)
    if (json === undefined)
      throw new Error(out.stderr.trim().split('\n')[0] || `pnpm audit exited ${out.status}`)
    const found = auditRows(parseAudit(json), label)
    rows.push(
      ...(found.length > 0
        ? found
        : [
            row({
              name: `npm advisories${label ? ` (${label})` : ''}`,
              status: STATUS.green,
              note: 'pnpm audit: none',
            }),
          ])
    )
  } catch (error) {
    rows.push(unavailable(`pnpm audit${label ? ` (${label})` : ''}`, error))
  }
  return rows
}

export default {
  id: 'node',
  title: 'Node packages (pnpm outdated · pnpm audit)',
  async run(ctx) {
    if (ctx.options.offline) return [unavailable('pnpm outdated / audit', 'offline')]
    const rows = await workspaceRows(ctx, ctx.repo.root, '')
    if (ctx.options.examples && ctx.repo.exists(PATHS.examples)) {
      rows.push(...(await workspaceRows(ctx, ctx.repo.path(PATHS.examples), 'examples')))
    }
    return rows
  },
}
