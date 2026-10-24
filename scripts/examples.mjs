#!/usr/bin/env node
// Docs: docs/contributing/commands.md
// Runs one action across every app in the examples repo and prints a pass/fail/skip summary.
//
// Usage:
//   pnpm dev:examples install
//   pnpm dev:examples build [--release]          # build android; needs the CLI built (pnpm build)
//   pnpm dev:examples test
//   pnpm dev:examples all [--release]            # install → build → test
//   pnpm dev:examples build --filter react       # only dirs whose name contains "react"
//
// The example apps are CAPSULE_EXAMPLES_DIR (default examples/ in this repo). The richer
// per-app test command is `capsule test` (docs/contributing/testing.md); this batch runs `pnpm test`
// and skips apps without a test script.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { devEnv, repoRoot, run } from './lib/env.mjs'

const argv = process.argv.slice(2)
const action = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'install'
let release = false
let filter = ''
while (argv.length > 0) {
  const flag = argv.shift()
  if (flag === '--release') release = true
  else if (flag === '--filter') filter = argv.shift() ?? ''
  else fail(`Unknown option ${flag}`)
}
const steps = {
  install: ['install'],
  build: ['build'],
  test: ['test'],
  all: ['install', 'build', 'test'],
}[action]
if (!steps) fail(`Unknown action ${action}`)

const { vars } = devEnv()
const examplesDir = vars.CAPSULE_EXAMPLES_DIR
const cli = join(repoRoot, 'packages', 'cli', 'dist', 'index.js')
if (!existsSync(examplesDir))
  fail(`Examples not found at ${examplesDir} — set CAPSULE_EXAMPLES_DIR in .env.local`)
if (steps.includes('build') && !existsSync(cli)) fail('CLI not built — run `pnpm build` first')

const apps = readdirSync(examplesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.includes(filter))
  .map((entry) => join(examplesDir, entry.name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .sort()
if (apps.length === 0) fail(`No example apps match "${filter}"`)

const results = []
for (const dir of apps) {
  for (const step of steps) {
    const label = `${dir.split(/[\\/]/).pop()} : ${step}`
    console.log(`\n=== ${label} ===`)
    results.push([label, runStep(step, dir)])
  }
}

console.log('\n===== Summary =====')
for (const [label, result] of results) console.log(`  ${label.padEnd(44)} ${result}`)
const failed = results.filter(([, result]) => result.startsWith('FAIL')).length
console.log(failed ? `\n${failed} failed.` : '\nAll good.')
process.exit(failed ? 1 : 0)

function runStep(step, dir) {
  const opts = { env: vars, cwd: dir }
  let code
  if (step === 'install') {
    code = run('pnpm', ['install'], opts)
  } else if (step === 'build') {
    code = run(process.execPath, [cli, 'build', 'android', ...(release ? ['--release'] : [])], opts)
  } else {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (!pkg.scripts?.test) return 'SKIP (no test script)'
    code = run('pnpm', ['test'], opts)
  }
  return code === 0 ? 'OK' : `FAIL (exit ${code})`
}

function fail(message) {
  console.error(`${message}.`)
  process.exit(2)
}
