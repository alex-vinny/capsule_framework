// Renders docs/reference/generated/config.md from CONFIG_FIELDS (packages/cli/src/config.ts).
// Imports the BUILT CLI (packages/cli/dist/config.js) — run `pnpm build` first (`pnpm gen` does).

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cell, notice, root, table } from './lib.mjs'

const configModule = join(root, 'packages', 'cli', 'dist', 'config.js')

// Union types contain `|`; an escaped pipe inside a code span renders literally in some markdown
// table implementations, so those stay plain text.
const type = (value) => (value.includes('|') ? cell(value) : `\`${value}\``)

const row = (field) => [
  `\`${field.key}\``,
  type(field.type),
  field.required ? 'yes' : 'no',
  cell(field.default),
  cell(field.description),
]

/** Writes `<outDir>/config.md`. */
export async function generateConfigReference(outDir) {
  if (!existsSync(configModule)) {
    throw new Error(
      `${configModule} not found — build the CLI first (pnpm --filter @capsule/cli build).`
    )
  }
  const { CONFIG_FIELDS } = await import(pathToFileURL(configModule).href)

  const topLevel = CONFIG_FIELDS.filter(
    (field) => !field.key.includes('.') && !field.key.includes('[')
  )
  const isSection = (field) =>
    CONFIG_FIELDS.some(
      (other) => other.key.startsWith(`${field.key}.`) || other.key.startsWith(`${field.key}[]`)
    )
  const headers = ['Key', 'Type', 'Required', 'Default', 'Description']

  const out = [
    '# `capsule.config.ts` reference',
    '',
    notice('`CONFIG_FIELDS` in `packages/cli/src/config.ts`'),
    'The project config is a TypeScript module default-exporting a `CapsuleConfig`',
    '(wrap it in `defineConfig()` for type checking). **Required** means required within its',
    'parent: a required key of an optional section is only required when that section is present.',
    '`[]` marks the elements of an array.',
    '',
    '## Top-level keys',
    '',
    table(headers, topLevel.filter((field) => !isSection(field)).map(row)),
    '',
  ]
  for (const section of topLevel.filter(isSection)) {
    const members = CONFIG_FIELDS.filter(
      (field) =>
        field.key === section.key ||
        field.key.startsWith(`${section.key}.`) ||
        field.key.startsWith(`${section.key}[]`)
    )
    out.push(
      `## \`${section.key}\``,
      '',
      cell(section.description),
      '',
      table(headers, members.map(row)),
      ''
    )
  }
  writeFileSync(join(outDir, 'config.md'), `${out.join('\n').trimEnd()}\n`)
}
