#!/usr/bin/env node
// Docs: docs/concepts/primers/civetweb.md, docs/contributing/upkeep.md, docs/contributing/commands.md
// Vendors CivetWeb into packages/native/civetweb (see the README there).
//
// Usage:
//   node scripts/update-civetweb.mjs          # re-fetch the ref pinned in VERSION
//   node scripts/update-civetweb.mjs v1.17    # a tag, branch or full commit sha
//
// Needs only git and Node — works on Windows, macOS and Linux.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'packages', 'native', 'civetweb')
const versionFile = join(dest, 'VERSION')

const pinned = Object.fromEntries(
  readFileSync(versionFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => line.split('=', 2))
)
const repo = pinned.repo
const ref = process.argv[2] ?? pinned.ref

const work = mkdtempSync(join(tmpdir(), 'civetweb-'))
const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim()

try {
  console.log(`Fetching ${repo} @ ${ref} ...`)
  git('init', '--quiet')
  git('remote', 'add', 'origin', repo)
  // Fetching a single ref by name or sha keeps this a shallow, one-commit download.
  git('fetch', '--quiet', '--depth', '1', 'origin', ref)
  git('checkout', '--quiet', 'FETCH_HEAD')
  const commit = git('rev-parse', 'HEAD')

  const header = readFileSync(join(work, 'include', 'civetweb.h'), 'utf8')
  const version = /#define CIVETWEB_VERSION "([^"]+)"/.exec(header)?.[1] ?? 'unknown'

  const copies = [
    ['include/civetweb.h', 'include/civetweb.h'],
    ['src/civetweb.c', 'src/civetweb.c'],
    ['LICENSE.md', 'LICENSE.md'],
    ...readdirSync(join(work, 'src'))
      .filter((name) => name.endsWith('.inl'))
      .map((name) => [`src/${name}`, `src/${name}`]),
  ]
  for (const [from, to] of copies) copyFileSync(join(work, from), join(dest, to))

  writeFileSync(versionFile, `repo=${repo}\nref=${ref}\ncommit=${commit}\nversion=${version}\n`)
  console.log(`Vendored CivetWeb ${version} (${commit.slice(0, 7)}): ${copies.length} files.`)
  console.log('Stale .inl files from an older version are not deleted — check `git status`.')
} finally {
  rmSync(work, { recursive: true, force: true })
}
