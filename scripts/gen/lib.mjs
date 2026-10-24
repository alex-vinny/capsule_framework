// Shared helpers for the reference generators in scripts/gen/.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Committed output: docs/reference/generated/ (its README.md is hand-written and kept). */
export const generatedDir = join(root, 'docs', 'reference', 'generated')

/** The banner every generated page starts with. */
export const notice = (source) => `> Generated from ${source} by \`pnpm gen\` — do not edit.\n`

/** Escapes a value for a markdown table cell. */
export const cell = (value) =>
  value === undefined || value === null || value === ''
    ? '—'
    : String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')

/** Renders a markdown table; rows are arrays of already-formatted cells. */
export function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}
