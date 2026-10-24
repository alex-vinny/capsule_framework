#!/usr/bin/env node
// Docs: docs/concepts/primers/quickjs.md, docs/contributing/upkeep.md, docs/contributing/commands.md
// Vendors quickjs-ng into packages/native/quickjs (shared by the Android and iOS builds).
//
// Usage:
//   node scripts/update-quickjs.mjs           # the ref pinned in quickjs/VERSION, else the default branch
//   node scripts/update-quickjs.mjs v0.15.1   # a tag, branch or full commit sha
//
// Needs only git and Node — works on Windows, macOS and Linux. Then check the Android
// CMakeLists.txt still lists every .c file the new release needs.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'packages', 'native', 'quickjs')
const cmakeLists = join(
  root,
  'packages',
  'capsule-android',
  'capsule',
  'src',
  'main',
  'cpp',
  'CMakeLists.txt'
)
const versionFile = join(dest, 'VERSION')
const repo = 'https://github.com/quickjs-ng/quickjs'

const files = [
  'quickjs.c',
  'quickjs.h',
  'dtoa.c',
  'dtoa.h',
  'cutils.h',
  'libregexp.c',
  'libregexp.h',
  'libregexp-opcode.h',
  'libunicode.c',
  'libunicode.h',
  'libunicode-table.h',
  'list.h',
  'quickjs-atom.h',
  'quickjs-opcode.h',
  'quickjs-c-atomics.h',
  'builtin-array-fromasync.h',
  'builtin-iterator-zip.h',
  'builtin-iterator-zip-keyed.h',
  'LICENSE', // the MIT notice must ship with the vendored sources
]

const pinned = existsSync(versionFile)
  ? Object.fromEntries(
      readFileSync(versionFile, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('='))
        .map((line) => line.split('=', 2))
    )
  : {}
const ref = process.argv[2] ?? pinned.ref ?? 'HEAD'

const work = mkdtempSync(join(tmpdir(), 'quickjs-ng-'))
const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim()

try {
  console.log(`Fetching ${repo} @ ${ref} ...`)
  git('init', '--quiet')
  git('remote', 'add', 'origin', repo)
  // Fetching a single ref by name or sha keeps this a shallow, one-commit download.
  git('fetch', '--quiet', '--depth', '1', 'origin', ref)
  git('checkout', '--quiet', 'FETCH_HEAD')
  const commit = git('rev-parse', 'HEAD')

  mkdirSync(dest, { recursive: true })
  const missing = []
  for (const file of files) {
    if (existsSync(join(work, file))) copyFileSync(join(work, file), join(dest, file))
    else missing.push(file)
  }

  const header = readFileSync(join(dest, 'quickjs.h'), 'utf8')
  const part = (name) => new RegExp(`#define QJS_VERSION_${name} (\\d+)`).exec(header)?.[1] ?? '?'
  const version = `${part('MAJOR')}.${part('MINOR')}.${part('PATCH')}`

  // An unpinned run records the commit it got, so the next plain run fetches the same sources.
  writeFileSync(
    versionFile,
    `repo=${repo}\nref=${ref === 'HEAD' ? commit : ref}\ncommit=${commit}\nversion=${version}\n`
  )
  console.log(
    `Vendored quickjs-ng ${commit.slice(0, 7)}: ${files.length - missing.length} / ${files.length} files.`
  )
  if (missing.length > 0) {
    console.warn(`Not found (renamed in this release?): ${missing.join(', ')}`)
  }

  const sources = readFileSync(cmakeLists, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /quickjs/i.test(line) && line.endsWith('.c'))
  console.log(
    `CMakeLists.txt compiles: ${sources.join(', ')} — update it if the release added or dropped .c files.`
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}
