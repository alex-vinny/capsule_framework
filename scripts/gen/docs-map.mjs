// Writes docs/reference/generated/docs-map.md from the docs' front matter: every page with its
// audience, status and the code/test globs it documents, then the reverse view — each source
// folder and the pages that cover it. The format: docs/_core/conventions.md#doc-metadata.

import { writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { listRepoFiles, matchGlob, readDocsMeta } from '../docs-lint/lib/meta.mjs'
import { cell, notice, root, table } from './lib.mjs'

const code = (globs) => (globs && globs.length ? globs.map((g) => `\`${g}\``).join('<br>') : '—')
const link = (rel) => `[${rel.slice('docs/'.length)}](../../${rel.slice('docs/'.length)})`

export async function generateDocsMap(outDir) {
  const files = listRepoFiles(root)
  const docs = readDocsMeta(root, files).filter((d) => d.data)

  const pages = table(
    ['Page', 'Title', 'Audience', 'Status', 'Code', 'Tests'],
    docs.map(({ rel, data }) => [
      link(rel),
      cell(data.title),
      data.audience,
      data.status,
      code(data.code),
      code(data.tests),
    ])
  )

  // Reverse view: the folder of every file a page's `code:` globs match → the pages.
  const byFolder = new Map()
  for (const { rel, data } of docs) {
    for (const glob of data.code ?? []) {
      for (const file of matchGlob(files, glob)) {
        const folder = posix.dirname(file)
        if (!byFolder.has(folder)) byFolder.set(folder, new Set())
        byFolder.get(folder).add(rel)
      }
    }
  }
  const folders = table(
    ['Folder', 'Documented in'],
    [...byFolder.keys()]
      .sort()
      .map((folder) => [
        `\`${folder === '.' ? '(repo root)' : folder}/\``,
        [...byFolder.get(folder)].sort().map(link).join('<br>'),
      ])
  )

  const counts = Object.entries(
    docs.reduce((acc, { data }) => ({ ...acc, [data.status]: (acc[data.status] ?? 0) + 1 }), {})
  )
    .sort()
    .map(([status, n]) => `${n} ${status}`)
    .join(' · ')

  const page = [
    '# Docs ↔ code map',
    '',
    notice('the front matter of every page under docs/ (scripts/gen/docs-map.mjs)').trimEnd(),
    '',
    `${docs.length} pages (${counts}). How the metadata works and the checks that keep it true:`,
    '[conventions](../../_core/conventions.md#doc-metadata).',
    '',
    '## Pages',
    '',
    pages,
    '',
    '## Code folders → pages',
    '',
    'Which pages to update when you change a file in a folder. A folder is listed when a file in it',
    "matches a page's `code:` globs.",
    '',
    folders,
    '',
  ].join('\n')
  writeFileSync(join(outDir, 'docs-map.md'), page)
}
