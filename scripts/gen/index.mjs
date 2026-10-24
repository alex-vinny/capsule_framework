#!/usr/bin/env node
// Generates the committed files derived from code: the reference pages in
// docs/reference/generated/ (see the README there) and the CLI's Android toolchain module
// (packages/cli/src/platform/android-toolchain.ts, from the library's Gradle build).
//
// Usage:
//   node scripts/gen/index.mjs                 # regenerate everything in place
//   node scripts/gen/index.mjs --only cli      # one generator: core | cli | config | docs-map |
//                                              # android-toolchain
//   node scripts/gen/index.mjs --check         # regenerate into a temp dir; exit 1 if the
//                                              # committed files differ (CI drift gate)
//
// The CLI and config generators import the built CLI — `pnpm gen` builds it first.
// docs-map and android-toolchain need no build.
// Needs only Node (plus the repo's installed dev dependencies) — works on Windows, macOS, Linux.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { generateCliReference } from './cli-reference.mjs'
import { generateConfigReference } from './config-reference.mjs'
import { generateCoreReference } from './core-reference.mjs'
import { generateDocsMap } from './docs-map.mjs'
import { generateAndroidToolchain, toolchainFile, toolchainOutDir } from './android-toolchain.mjs'
import { generatedDir, root } from './lib.mjs'

// `base` is where a generator's committed `outputs` live; `run(outDir)` writes them into outDir.
const generators = {
  core: { base: generatedDir, outputs: ['core'], run: generateCoreReference },
  cli: { base: generatedDir, outputs: ['cli.md'], run: generateCliReference },
  config: { base: generatedDir, outputs: ['config.md'], run: generateConfigReference },
  'docs-map': { base: generatedDir, outputs: ['docs-map.md'], run: generateDocsMap },
  'android-toolchain': {
    base: toolchainOutDir,
    outputs: [toolchainFile],
    run: generateAndroidToolchain,
  },
}

const args = process.argv.slice(2)
const check = args.includes('--check')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
if (only !== undefined && !(only in generators)) {
  console.error(`Unknown generator "${only}". Use one of: ${Object.keys(generators).join(', ')}`)
  process.exit(2)
}
const selected = only ? [only] : Object.keys(generators)

/** Relative path → content (line endings normalised) for every file under `paths` in `base`. */
function snapshot(base, paths) {
  const files = new Map()
  const visit = (path) => {
    if (!existsSync(path)) return
    if (statSync(path).isDirectory())
      return readdirSync(path).forEach((name) => visit(join(path, name)))
    files.set(
      relative(base, path).replace(/\\/g, '/'),
      readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    )
  }
  paths.forEach((path) => visit(join(base, path)))
  return files
}

// In --check mode each generator writes into its own temp subdir, compared against its base.
const tempRoot = check ? mkdtempSync(join(tmpdir(), 'capsule-gen-')) : undefined
const outDirOf = (name) => (check ? join(tempRoot, name) : generators[name].base)
try {
  const stale = []
  for (const name of selected) {
    console.log(`Generating ${name} ...`)
    const { base, outputs, run } = generators[name]
    const outDir = outDirOf(name)
    mkdirSync(outDir, { recursive: true })
    await run(outDir)

    if (check) {
      const fresh = snapshot(outDir, outputs)
      const committed = snapshot(base, outputs)
      for (const file of new Set([...fresh.keys(), ...committed.keys()])) {
        if (fresh.get(file) !== committed.get(file)) {
          stale.push(relative(root, join(base, file)).replace(/\\/g, '/'))
        }
      }
    }
  }

  if (check) {
    if (stale.length > 0) {
      console.error(`Generated files are out of date (${stale.length} file(s)):`)
      stale.sort().forEach((file) => console.error(`  ${file}`))
      console.error('Run `pnpm gen` and commit the result.')
      process.exitCode = 1
    } else {
      console.log('Generated files are up to date.')
    }
  }
} finally {
  if (check) rmSync(tempRoot, { recursive: true, force: true })
}
