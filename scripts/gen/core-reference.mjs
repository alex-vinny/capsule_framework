// Renders docs/reference/generated/core/ — the @capsule/core TypeScript API — with TypeDoc
// (packages/core/typedoc.json, typedoc-plugin-markdown). Reads the sources; no build needed.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { notice, root } from './lib.mjs'

const coreDir = join(root, 'packages', 'core')

function typedocBin() {
  const require = createRequire(join(coreDir, 'package.json'))
  const manifestPath = require.resolve('typedoc/package.json')
  const { bin } = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return join(dirname(manifestPath), typeof bin === 'string' ? bin : bin.typedoc)
}

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return markdownFiles(path)
    return name.endsWith('.md') ? [path] : []
  })
}

/** Writes `<outDir>/core/` (TypeDoc empties that folder first). */
export function generateCoreReference(outDir) {
  const target = join(outDir, 'core')
  execFileSync(process.execPath, [typedocBin(), '--options', 'typedoc.json', '--out', target], {
    cwd: coreDir,
    stdio: 'inherit',
  })
  for (const file of markdownFiles(target)) {
    writeFileSync(file, `${notice('`packages/core/src`')}\n${readFileSync(file, 'utf8')}`)
  }
}
