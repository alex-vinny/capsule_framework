#!/usr/bin/env node
// `pnpm upkeep` — one report of everything Capsule pins that the outside world moves: store
// requirements, the Android SDK/toolchain/libraries, vendored C, SwiftPM + Xcode, and npm.
// Process and cadence: docs/contributing/upkeep.md. It only reads — bumps are made by hand (or by
// Renovate PRs) after reading the report.
//
// Usage (from the repo root):
//   node scripts/upkeep/index.mjs                      # console table
//   node scripts/upkeep/index.mjs --markdown           # GitHub issue body (the weekly upkeep workflow)
//   node scripts/upkeep/index.mjs --json               # machine-readable
//   node scripts/upkeep/index.mjs --only store,swift   # some sections (ids below)
//   node scripts/upkeep/index.mjs --examples           # also pnpm outdated/audit inside examples/
//   node scripts/upkeep/index.mjs --accept-watch all   # record the store pages as reviewed (or one id)
//   node scripts/upkeep/index.mjs --offline            # no network: remote rows show as unavailable
//   node scripts/upkeep/index.mjs --strict             # exit 1 when anything is 🔴
//
// GITHUB_TOKEN (optional) lifts the GitHub API rate limit for the vendored + Swift sections.

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { needsShell, repoRoot } from '../lib/env.mjs'
import { createHttp } from './lib/http.mjs'
import { STATUS, renderConsole, renderJson, renderMarkdown } from './lib/report.mjs'
import { createRepo } from './repo.mjs'
import { libraries, platform, toolchain } from './sections/android.mjs'
import node from './sections/node.mjs'
import store from './sections/store.mjs'
import swift from './sections/swift.mjs'
import vendored from './sections/vendored.mjs'

export const SECTIONS = [store, platform, toolchain, libraries, vendored, swift, node]

export function parseArgs(argv) {
  const options = {
    format: 'console',
    only: undefined,
    examples: false,
    offline: false,
    strict: false,
    acceptWatch: undefined,
    date: undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined) throw new Error(`${arg} needs a value`)
      return next
    }
    if (arg === '--json') options.format = 'json'
    else if (arg === '--markdown') options.format = 'markdown'
    else if (arg === '--examples') options.examples = true
    else if (arg === '--offline') options.offline = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--only')
      options.only = new Set(
        value()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    else if (arg === '--accept-watch') {
      const ids = value()
      options.acceptWatch = ids === 'all' ? 'all' : new Set(ids.split(','))
    } else if (arg === '--date')
      options.date = value() // evaluate store rules as of another day
    else if (arg === '--help' || arg === '-h') options.help = true
    else
      throw new Error(
        `Unknown option ${arg} — see the usage at the top of scripts/upkeep/index.mjs`
      )
  }
  return options
}

/** Runs a command and returns its output whatever the exit code (`pnpm outdated` exits 1 when behind). */
function exec(command, args, { cwd } = {}) {
  const shell = needsShell(command)
  const result = shell
    ? spawnSync([command, ...args].join(' '), {
        cwd,
        encoding: 'utf8',
        shell: true,
        maxBuffer: 64 * 1024 * 1024,
      })
    : spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** Runs the selected sections; a section that throws becomes one ⚪ row instead of ending the run. */
export async function runSections(sections, ctx) {
  const results = []
  for (const section of sections) {
    let rows
    try {
      rows = await section.run(ctx)
    } catch (error) {
      rows = [
        {
          name: section.title,
          current: '',
          latest: '',
          status: STATUS.unavailable,
          note: `section failed: ${error.message}`,
          source: '',
        },
      ]
    }
    results.push({ id: section.id, title: section.title, rows })
  }
  return results
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(
      `Sections: ${SECTIONS.map((s) => s.id).join(', ')}. Options: see scripts/upkeep/index.mjs.`
    )
    return
  }
  const unknown = [...(options.only ?? [])].filter((id) => !SECTIONS.some((s) => s.id === id))
  if (unknown.length > 0)
    throw new Error(
      `Unknown section(s): ${unknown.join(', ')} — known: ${SECTIONS.map((s) => s.id).join(', ')}`
    )

  const repo = createRepo(repoRoot)
  const ctx = {
    repo,
    http: createHttp({ offline: options.offline, token: process.env.GITHUB_TOKEN }),
    today: options.date ? new Date(`${options.date}T00:00:00Z`) : new Date(),
    options,
    exec,
    writeFile: (rel, text) => writeFileSync(repo.path(rel), text),
  }
  const selected = SECTIONS.filter((s) => !options.only || options.only.has(s.id))
  const sections = await runSections(selected, ctx)
  const meta = { generatedAt: ctx.today.toISOString().slice(0, 10) }
  const render = { console: renderConsole, markdown: renderMarkdown, json: renderJson }[
    options.format
  ]
  console.log(render(sections, meta))
  if (options.strict && sections.some((s) => s.rows.some((r) => r.status === STATUS.red)))
    process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 2
  })
}
