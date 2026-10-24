#!/usr/bin/env node
// docs-lint — zero-dependency consistency validator for the Capsule docs/ tree.
//
//   pnpm docs:lint [--strict]     (or: node scripts/docs-lint/bin/docs-lint.mjs [--strict] [--docs <path>])
//
// --strict   promote warnings to failures (exit 1 on any warning too)
// --docs     path to the docs/ dir (default: the repo's docs/,
//            or $CAPSULE_DOCS_DIR)
//
// Exit codes: 0 = clean, 1 = failures, 2 = bad invocation.

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { buildContext } from '../lib/context.mjs'
import { createReport, printReport } from '../lib/report.mjs'

import links from '../checks/links.mjs'
import phaseCoherence from '../checks/phase-coherence.mjs'
import principlesMirror from '../checks/principles-mirror.mjs'
import indexCoverage from '../checks/index-coverage.mjs'

const CHECKS = [links, phaseCoherence, principlesMirror, indexCoverage]

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const strict = argv.includes('--strict')

const docsFlagIdx = argv.indexOf('--docs')
const docsDir = resolve(
  docsFlagIdx >= 0 && argv[docsFlagIdx + 1]
    ? argv[docsFlagIdx + 1]
    : process.env.CAPSULE_DOCS_DIR || resolve(HERE, '..', '..', '..', 'docs')
)

if (!existsSync(docsDir)) {
  console.error(`docs-lint: docs dir not found: ${docsDir}`)
  console.error(`Pass --docs <path> or set CAPSULE_DOCS_DIR.`)
  process.exit(2)
}

const ctx = buildContext(docsDir)
const report = createReport()
for (const check of CHECKS) check.run(ctx, report)

const phaseCount = [...ctx.canonical.keys()].filter((k) => !k.includes('.')).length
const code = printReport(report, { strict, fileCount: ctx.mdFiles.length, phaseCount })
process.exit(code)
