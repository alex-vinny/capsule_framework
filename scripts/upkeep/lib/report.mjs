// Row/status model shared by every section, and the three renderers (console, markdown, json).
//
// A section is `{ id, title, run(ctx) → Promise<Row[]> }`; a row is
// `{ name, current, latest, status, note, source }` with status one of STATUS.

import { classifyUpdate } from './versions.mjs'

/** 🔴 forced/security — schedule now · 🟡 behind — bump when convenient · 🟢 current · ⚪ couldn't check. */
export const STATUS = Object.freeze({
  red: 'red',
  yellow: 'yellow',
  green: 'green',
  unavailable: 'unavailable',
})

export const ICON = { red: '🔴', yellow: '🟡', green: '🟢', unavailable: '⚪' }
const RANK = { red: 3, yellow: 2, unavailable: 1, green: 0 }

export function row({ name, current = '', latest = '', status, note = '', source = '' }) {
  return {
    name,
    current: String(current ?? ''),
    latest: String(latest ?? ''),
    status,
    note,
    source,
  }
}

/** A row for a source that could not be read — the run carries on. */
export function unavailable(name, error, source = '', current = '') {
  const reason = error instanceof Error ? error.message : String(error)
  return row({ name, current, status: STATUS.unavailable, note: `unavailable: ${reason}`, source })
}

/** A dependency row: 🟢 when current, 🟡 when behind (note names patch/minor/major). */
export function versionRow({ name, current, latest, source, note = '' }) {
  const kind = classifyUpdate(current, latest)
  const behind = ['patch', 'minor', 'major'].includes(kind)
  const label = behind ? `${kind} update` : kind === 'ahead' ? 'ahead of latest stable' : ''
  return row({
    name,
    current,
    latest,
    status: kind === 'unknown' ? STATUS.unavailable : behind ? STATUS.yellow : STATUS.green,
    note: [label, note].filter(Boolean).join(' — '),
    source,
  })
}

export function worst(rows) {
  return rows.reduce((acc, r) => (RANK[r.status] > RANK[acc] ? r.status : acc), STATUS.green)
}

export function counts(sections) {
  const total = { red: 0, yellow: 0, green: 0, unavailable: 0 }
  for (const section of sections) for (const r of section.rows) total[r.status]++
  return total
}

const summaryLine = (total) =>
  `${ICON.red} ${total.red} · ${ICON.yellow} ${total.yellow} · ${ICON.green} ${total.green} · ${ICON.unavailable} ${total.unavailable}`

// ── console ──────────────────────────────────────────────────────────────────

function pad(text, width) {
  // Emoji count as two columns in most terminals; the status column is the only place they appear.
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

export function renderConsole(sections, { generatedAt }) {
  const out = [`Capsule upkeep report — ${generatedAt}`, summaryLine(counts(sections)), '']
  for (const section of sections) {
    out.push(`${ICON[worst(section.rows)]} ${section.title}`)
    const w = {
      name: Math.min(44, Math.max(4, ...section.rows.map((r) => r.name.length))),
      current: Math.min(24, Math.max(7, ...section.rows.map((r) => r.current.length))),
      latest: Math.min(24, Math.max(6, ...section.rows.map((r) => r.latest.length))),
    }
    for (const r of section.rows) {
      out.push(
        `  ${ICON[r.status]} ${pad(r.name, w.name)}  ${pad(r.current, w.current)}  ${pad(r.latest, w.latest)}  ${r.note}`
      )
    }
    if (section.rows.length === 0) out.push('  (nothing to check)')
    out.push('')
  }
  return out.join('\n')
}

// ── markdown (the weekly "Upkeep report" issue body) ────────────────────────

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

export function renderMarkdown(sections, { generatedAt }) {
  const total = counts(sections)
  const out = [
    `# Upkeep report`,
    '',
    `Generated ${generatedAt} by \`pnpm upkeep\` (\`scripts/upkeep/\`). Process: \`docs/contributing/upkeep.md\`.`,
    '',
    `**${summaryLine(total)}** — 🔴 security or a store deadline: schedule now · 🟡 behind: bump when convenient · ⚪ source unavailable.`,
    '',
  ]
  const urgent = sections.flatMap((s) =>
    s.rows.filter((r) => r.status === STATUS.red).map((r) => ({ s, r }))
  )
  if (urgent.length > 0) {
    out.push('## Needs action', '')
    for (const { s, r } of urgent)
      out.push(`- ${ICON.red} **${cell(r.name)}** (${s.title}) — ${cell(r.note)}`)
    out.push('')
  }
  for (const section of sections) {
    out.push(`## ${ICON[worst(section.rows)]} ${section.title}`, '')
    if (section.rows.length === 0) {
      out.push('_Nothing to check._', '')
      continue
    }
    out.push('| | Item | Current | Latest | Note |', '|---|---|---|---|---|')
    for (const r of section.rows) {
      const name = r.source ? `[${cell(r.name)}](${r.source})` : cell(r.name)
      out.push(
        `| ${ICON[r.status]} | ${name} | ${cell(r.current)} | ${cell(r.latest)} | ${cell(r.note)} |`
      )
    }
    out.push('')
  }
  return out.join('\n')
}

export function renderJson(sections, { generatedAt }) {
  return JSON.stringify({ generatedAt, summary: counts(sections), sections }, null, 2)
}
