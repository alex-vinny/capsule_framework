#!/usr/bin/env node
// Docs: docs/contributing/ci.md, docs/contributing/commands.md
// The definition of done (AGENTS.md, CONTRIBUTING.md): the same checks as CI's `js` job, in order,
// stopping at the first failure, then a summary.
//
// Usage (from the repo root):
//   pnpm verify                 # format, lint, typecheck, test, docs
//   pnpm verify --keep-going    # run every step even after a failure
//   pnpm verify:android         # = node scripts/verify.mjs --android  (AAR build + JVM unit tests)
//   pnpm verify:ios             # = node scripts/verify.mjs --ios      (swift test in Docker)
//
// Needs only Node (plus Docker for --ios, a JDK + Android SDK for --android) — works on Windows,
// macOS and Linux.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { devEnv, gradlew, repoRoot, run } from './lib/env.mjs'

const flags = new Set(process.argv.slice(2))
const keepGoing = flags.has('--keep-going')

const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts
// `advisory` steps report a failure but don't fail the run — kept in step with ci.yml.
const pnpmStep = (script, advisory = false) => ({
  name: `pnpm ${script}`,
  advisory,
  exec: () => run('pnpm', ['run', '--silent', script], { cwd: repoRoot }),
})

let steps
if (flags.has('--android')) {
  const cwd = join(repoRoot, 'packages', 'capsule-android')
  steps = [
    {
      name: 'gradlew assembleDebug testDebugUnitTest',
      exec: () =>
        run(gradlew(cwd), ['assembleDebug', 'testDebugUnitTest'], { env: devEnv().vars, cwd }),
    },
  ]
} else if (flags.has('--ios')) {
  steps = [
    {
      name: 'swift test (Docker, swift:6.4-jammy)',
      exec: () =>
        run('docker', [
          'run',
          '--rm',
          '-v',
          `${repoRoot}:/workspace`,
          '-w',
          '/workspace',
          'swift:6.4-jammy',
          'swift',
          'test',
          '--scratch-path',
          '/tmp/build',
        ]),
    },
  ]
} else {
  steps = [
    pnpmStep('format:check'),
    pnpmStep('lint'),
    pnpmStep('typecheck'),
    pnpmStep('test'),
    pnpmStep('test:scripts'),
    pnpmStep('docs:check'),
    pnpmStep('gen:check'),
    pnpmStep('docs:lint', true),
  ].filter((step) => step.name.slice('pnpm '.length) in scripts)
}

const results = []
for (const step of steps) {
  console.log(`\n▶ ${step.name}`)
  const started = Date.now()
  const status = step.exec()
  results.push({ ...step, status, seconds: ((Date.now() - started) / 1000).toFixed(1) })
  if (status !== 0 && !step.advisory && !keepGoing) break
}

console.log('\nverify summary')
for (const { name, status, advisory, seconds } of results) {
  const mark = status === 0 ? 'ok  ' : advisory ? 'warn' : 'FAIL'
  console.log(`  ${mark}  ${name}  (${seconds}s)`)
}
for (const step of steps.slice(results.length)) console.log(`  skip  ${step.name}`)

const failed = results.some((r) => r.status !== 0 && !r.advisory)
process.exit(failed ? 1 : 0)
