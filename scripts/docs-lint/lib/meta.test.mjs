import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  formatFrontMatter,
  globToRegExp,
  headingAnchors,
  isHeaderScanned,
  matchGlob,
  parseFrontMatter,
  readCodeHeader,
  validateFrontMatter,
} from './meta.mjs'

test('parseFrontMatter reads scalars, flow lists and block lists', () => {
  const { data, body } = parseFrontMatter(
    '﻿---\ntitle: "Database: SQLite"\naudience: app-developer\nstatus: current\n' +
      'code: [packages/core/src/db.ts, "packages/cli/**"]\ntests:\n  - packages/core/src/__tests__/db.test.ts\n---\n# Database\n'
  )
  assert.deepEqual(data, {
    title: 'Database: SQLite',
    audience: 'app-developer',
    status: 'current',
    code: ['packages/core/src/db.ts', 'packages/cli/**'],
    tests: ['packages/core/src/__tests__/db.test.ts'],
  })
  assert.equal(body, '# Database\n')
})

test('parseFrontMatter: no block, and an unclosed block', () => {
  assert.equal(parseFrontMatter('# Title\n---\n').data, null)
  assert.match(parseFrontMatter('---\ntitle: x\n# Title\n').error, /never closes/)
})

test('formatFrontMatter round-trips through parseFrontMatter', () => {
  const meta = {
    title: 'ADR-001 — "Embedded" runtime',
    audience: 'contributor',
    status: 'record',
    code: ['packages/capsule-android/**/runtime/*.kt'],
  }
  assert.deepEqual(parseFrontMatter(formatFrontMatter(meta) + '# x\n').data, meta)
})

test('validateFrontMatter flags each schema problem', () => {
  assert.deepEqual(validateFrontMatter({ title: 'T', audience: 'everyone', status: 'current' }), [])
  assert.deepEqual(validateFrontMatter(null), ['no front matter (title, audience, status)'])
  const problems = validateFrontMatter({
    title: '',
    audience: 'devs',
    status: 'done',
    code: ['**/x.ts', '../y', 'ok/z.ts'],
    owner: 'me',
  })
  assert.equal(problems.length, 6)
  assert.ok(problems.some((p) => p.includes('unknown key "owner"')))
  assert.ok(problems.some((p) => p.includes('must start with a path segment')))
  assert.ok(problems.some((p) => p.includes('repo-relative')))
})

test('globToRegExp: **, * and ?', () => {
  const files = [
    'packages/core/src/db.ts',
    'packages/core/src/__tests__/db.test.ts',
    'packages/core/src/a/b/c.ts',
    'packages/cli/src/x.ts',
  ]
  assert.deepEqual(matchGlob(files, 'packages/core/src/*.ts'), ['packages/core/src/db.ts'])
  assert.deepEqual(matchGlob(files, 'packages/core/src/**/*.ts'), files.slice(0, 3))
  assert.deepEqual(matchGlob(files, 'packages/core/**'), files.slice(0, 3))
  assert.deepEqual(matchGlob(files, 'packages/c?i/src/x.ts'), ['packages/cli/src/x.ts'])
  assert.ok(!globToRegExp('a.b').test('aXb'))
})

test('readCodeHeader finds the header in the first lines, in any comment style', () => {
  assert.deepEqual(readCodeHeader('// Docs: docs/guide/database.md\nexport {}\n'), [
    { ref: 'docs/guide/database.md', path: 'docs/guide/database.md', anchor: undefined },
  ])
  assert.deepEqual(
    readCodeHeader('/**\n * Docs: docs/guide/ai.md#tiers, docs/reference/core-api.md */\n').map(
      (r) => r.ref
    ),
    ['docs/guide/ai.md#tiers', 'docs/reference/core-api.md']
  )
  assert.equal(
    readCodeHeader('# Docs: docs/contributing/ci.md\n')[0].path,
    'docs/contributing/ci.md'
  )
  assert.equal(readCodeHeader('x\n'.repeat(15) + '// Docs: docs/late.md\n'), null)
})

test('isHeaderScanned: packages, scripts and example sources, never vendored C', () => {
  assert.ok(isHeaderScanned('packages/core/src/db.ts'))
  assert.ok(isHeaderScanned('scripts/verify.mjs'))
  assert.ok(isHeaderScanned('examples/react-ts/src/App.tsx'))
  assert.ok(isHeaderScanned('packages/capsule-android/capsule/src/main/cpp/CMakeLists.txt'))
  assert.ok(!isHeaderScanned('examples/react-ts/vite.config.ts'))
  assert.ok(!isHeaderScanned('packages/native/quickjs/quickjs.c'))
  assert.ok(!isHeaderScanned('packages/core/README.md'))
})

test('headingAnchors accepts GitHub and mkdocs slugs, skips fenced code', () => {
  const anchors = headingAnchors(
    '# Part 1 — Start\n## Custom {#my-id}\n```sh\n# not a heading\n```\n'
  )
  assert.ok(anchors.has('part-1--start'))
  assert.ok(anchors.has('part-1-start'))
  assert.ok(anchors.has('my-id'))
  assert.ok(anchors.has('custom'))
  assert.ok(!anchors.has('not-a-heading'))
})
