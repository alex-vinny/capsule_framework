// The sections end to end against a throwaway mini repo (fixture files at the real paths) and a
// fake network — no real requests, no pnpm.

import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseArgs, runSections } from './index.mjs'
import { createHttp, fakeFetch } from './lib/http.mjs'
import { STATUS, renderJson, renderMarkdown } from './lib/report.mjs'
import { pageHash } from './parsers/page.mjs'
import { PATHS, createRepo } from './repo.mjs'
import { libraries, maxApiFor, platform, toolchain } from './sections/android.mjs'
import node from './sections/node.mjs'
import store from './sections/store.mjs'
import swift from './sections/swift.mjs'
import vendored from './sections/vendored.mjs'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name) => readFileSync(join(fixtures, name), 'utf8')

const REQUIREMENTS = {
  reviewed: '2026-10-01',
  rules: [
    {
      id: 'play-target-36',
      store: 'google-play',
      field: 'android.targetSdk',
      min: 36,
      effective: '2026-08-31',
      appliesTo: 'new-and-updates',
      extensionUntil: '2026-11-01',
      source: 'https://play.example/target',
    },
    {
      id: 'apple-xcode-26',
      store: 'app-store',
      field: 'ios.xcode',
      min: '26',
      effective: '2026-04-28',
      appliesTo: 'new-and-updates',
      source: 'https://apple.example/upcoming',
    },
    {
      id: 'apple-deployment-13',
      store: 'app-store',
      field: 'ios.deploymentTarget',
      min: '13',
      effective: '2026-09-09',
      appliesTo: 'new-and-updates',
      source: 'https://apple.example/upcoming',
    },
  ],
  watch: [
    { id: 'apple', url: 'https://apple.example/upcoming', sha256: '', reviewed: '' },
    { id: 'play', url: 'https://play.example/target', sha256: 'stale', reviewed: '2026-01-01' },
  ],
}

// A stand-in for packages/cli/dist/platform/requirements.js with the contract's shape.
const FAKE_EVALUATOR = `
export const REQUIREMENTS_STALE_DAYS = 120
export function evaluateRequirements(rules, pins, today) {
  return rules.map((r) => {
    const current = pins[r.field]
    const base = { ruleId: r.id, store: r.store, field: r.field, required: r.min, effective: r.effective, source: r.source }
    if (current === undefined) return { ...base, status: 'unknown', message: r.field + ' not set' }
    if (Number(current) >= Number(r.min)) return { ...base, current, status: 'ok', message: 'meets ' + r.min }
    return { ...base, current, status: today >= new Date(r.effective) ? 'violated' : 'upcoming', message: 'below ' + r.min }
  })
}
`

let root
let repo
const writes = []

function place(rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'upkeep-test-'))
  place(PATHS.catalog, fixture('libs.versions.toml'))
  place(PATHS.libraryBuild, fixture('build.gradle.kts'))
  place(PATHS.wrapper, fixture('gradle-wrapper.properties'))
  place(PATHS.cliToolchain, fixture('android-toolchain.ts.fixture'))
  place(PATHS.packageSwift, fixture('Package.swift'))
  copyFileSync(join(fixtures, 'Package.resolved'), join(root, PATHS.packageResolved))
  place(PATHS.requirements, JSON.stringify(REQUIREMENTS, null, 2))
  place(PATHS.requirementsDist, FAKE_EVALUATOR)
  place(PATHS.ci, 'jobs:\n  ios-linux:\n    container: swift:6.3-jammy\n')
  place(
    `${PATHS.native}/quickjs/VERSION`,
    'repo=https://github.com/quickjs-ng/quickjs\nref=v0.15.1\nversion=0.15.1\n'
  )
  place(
    `${PATHS.native}/civetweb/VERSION`,
    'repo=https://github.com/civetweb/civetweb\nref=v1.16\ncommit=d7ba\nversion=1.16\n'
  )
  repo = createRepo(root)
})

after(() => rmSync(root, { recursive: true, force: true }))

const ctxWith = (routes, options = {}, extra = {}) => ({
  repo,
  http: createHttp({ fetchImpl: fakeFetch(routes) }),
  today: new Date('2026-10-24T00:00:00Z'),
  options: { ...options },
  writeFile: (rel, text) => {
    writes.push(rel)
    writeFileSync(join(root, rel), text)
  },
  ...extra,
})

const byName = (rows, part) => rows.find((r) => r.name.includes(part))

describe('store section', () => {
  it('evaluates the rules per pin set and flags unpinned fields once', async () => {
    const rows = await store.run(
      ctxWith({ 'apple\\.example': fixture('page.html'), 'play\\.example': '<main>Play</main>' })
    )
    const target = byName(rows, 'play-target-36 — capsule init')
    assert.equal(
      target.status,
      STATUS.red,
      'targetSdk 35 (= compileSdk, targetSdk null) is below 36 after the deadline'
    )
    assert.equal(target.current, '35')
    assert.equal(byName(rows, 'apple-deployment-13 — library').status, STATUS.green)
    assert.equal(byName(rows, 'apple-xcode-26').status, STATUS.unavailable)
    assert.equal(rows.filter((r) => r.name.startsWith('apple-xcode-26')).length, 1)
    assert.equal(byName(rows, 'reviewed').status, STATUS.green)
  })

  it('watch: never reviewed and changed pages are 🟡; --accept-watch records the hash', async () => {
    const routes = {
      'apple\\.example': fixture('page.html'),
      'play\\.example': '<main>Play</main>',
    }
    const rows = await store.run(ctxWith(routes))
    assert.equal(byName(rows, 'watch: apple').status, STATUS.yellow)
    assert.match(byName(rows, 'watch: play').note, /changed since last review/)

    await store.run(ctxWith(routes, { acceptWatch: new Set(['apple']) }))
    const saved = JSON.parse(readFileSync(join(root, PATHS.requirements), 'utf8'))
    assert.equal(saved.watch[0].sha256, pageHash(fixture('page.html')))
    assert.equal(saved.watch[0].reviewed, '2026-10-24')
    assert.equal(saved.watch[1].sha256, 'stale', 'only the accepted id changes')

    const again = await store.run(ctxWith(routes))
    assert.equal(byName(again, 'watch: apple').status, STATUS.green)
  })

  it('an unreachable watch page is ⚪, not a crash', async () => {
    const rows = await store.run(ctxWith({ 'apple\\.example': new Error('ECONNRESET') }))
    assert.equal(byName(rows, 'watch: apple').status, STATUS.unavailable)
    assert.equal(byName(rows, 'watch: play').status, STATUS.unavailable)
  })
})

describe('android sections', () => {
  const routes = {
    'repository2-3\\.xml': fixture('repository2-3.xml'),
    'services\\.gradle\\.org': { version: '9.8.2' },
    'com/android/tools/build/gradle/maven-metadata':
      '<versions><version>8.7.0</version><version>9.4.1</version><version>9.5.0-rc01</version></versions>',
    'kotlin-gradle-plugin/maven-metadata':
      '<versions><version>2.0.0</version><version>2.4.21</version><version>2.5.0-Beta2</version></versions>',
    'com/google/devtools/ksp/com.google.devtools.ksp.gradle.plugin/maven-metadata':
      '<versions><version>2.0.0-1.0.24</version><version>2.3.0</version></versions>',
    'dl\\.google\\.com/dl/android/maven2/com/google/guava': new Error('not on Google Maven'),
    'repo1\\.maven\\.org/maven2/com/google/guava/guava/maven-metadata':
      fixture('maven-metadata.xml'),
    'com/google/mlkit/genai-prompt/maven-metadata':
      '<versions><version>1.0.0-beta2</version><version>1.0.0-beta4</version></versions>',
    'com/squareup/okhttp3/okhttp/maven-metadata':
      '<versions><version>4.12.0</version><version>5.5.1</version></versions>',
  }

  it('platform: latest stable API and NDK, with the AGP note', async () => {
    const rows = await platform.run(ctxWith(routes))
    const lib = byName(rows, 'compileSdk — library')
    assert.equal(lib.latest, '36')
    assert.equal(lib.status, STATUS.yellow)
    assert.match(lib.note, /minor SDK 36\.1/)
    assert.match(lib.note, /AGP ≥ 8\.9\.1/)
    const ndk = byName(rows, 'NDK')
    assert.equal(ndk.latest, '29.0.14206865')
    assert.match(ndk.note, /newest r27: 27\.3\.13750724/)
  })

  it('toolchain: AGP, Gradle and Kotlin with couplings; other plugins via their marker', async () => {
    const rows = await toolchain.run(ctxWith(routes))
    const agp = byName(rows, 'AGP')
    assert.equal(agp.latest, '9.4.1')
    assert.match(agp.note, /compiles up to API 35/)
    assert.match(agp.note, /needs Gradle ≥ 9\.6\.0/)
    assert.equal(byName(rows, 'Gradle wrapper').latest, '9.8.2')
    const kotlin = byName(rows, 'Kotlin')
    assert.equal(kotlin.latest, '2.4.21', 'no Beta for a stable pin')
    assert.match(kotlin.note, /unblocks mlkit/)
    assert.match(kotlin.note, /AGP 8\.7\.0's R8 reads Kotlin ≤ 2\.1/)
    assert.equal(byName(rows, 'plugin ksp').latest, '2.3.0')
  })

  it("toolchain: a Kotlin newer than AGP's R8 reads is 🔴", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'upkeep-kotlin-'))
    try {
      const catalog = fixture('libs.versions.toml').replace(
        /^kotlin(\s*)= "2\.0\.0"/m,
        'kotlin$1= "2.4.21"'
      )
      mkdirSync(dirname(join(dir, PATHS.catalog)), { recursive: true })
      writeFileSync(join(dir, PATHS.catalog), catalog)
      mkdirSync(dirname(join(dir, PATHS.wrapper)), { recursive: true })
      writeFileSync(join(dir, PATHS.wrapper), fixture('gradle-wrapper.properties'))
      const rows = await toolchain.run(ctxWith(routes, {}, { repo: createRepo(dir) }))
      const kotlin = byName(rows, 'Kotlin')
      assert.equal(kotlin.status, STATUS.red)
      assert.match(kotlin.note, /only up to 2\.1/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('libraries: Google Maven then Central, same flavour, holds noted, failures ⚪', async () => {
    const rows = await libraries.run(ctxWith(routes))
    const guava = byName(rows, 'guava')
    assert.equal(guava.latest, '33.4.0-android')
    assert.equal(byName(rows, 'genai-prompt').latest, '1.0.0-beta4')
    assert.match(byName(rows, 'genai-prompt').note, /Kotlin ≥ 2.3/)
    assert.match(byName(rows, 'okhttp').note, /^major update — held on 4.x/)
    assert.equal(byName(rows, 'org.example:lib').status, STATUS.unavailable)
  })

  it('maxApiFor reads the AGP table', () => {
    assert.equal(maxApiFor('8.7.0'), '35')
    assert.equal(maxApiFor('8.13.0'), '36.1')
    assert.equal(maxApiFor('9.4.1'), '37.0')
  })
})

describe('vendored section', () => {
  it('compares VERSION with the latest release and lists advisories that affect the pin', async () => {
    const rows = await vendored.run(
      ctxWith({
        'quickjs-ng/quickjs/releases/latest': { tag_name: 'v0.17.0' },
        'quickjs-ng/quickjs/releases/tags': {
          tag_name: 'v0.15.1',
          published_at: '2026-06-04T14:57:07Z',
        },
        'quickjs-ng/quickjs/security-advisories': fixture('github-advisories.json'),
        'civetweb/civetweb/releases/latest': { tag_name: 'v1.16' },
        'civetweb/civetweb/releases/tags': {
          tag_name: 'v1.16',
          published_at: '2023-04-10T18:30:52Z',
        },
        'civetweb/civetweb/security-advisories': [],
      })
    )
    const quickjs = byName(rows, 'quickjs (quickjs-ng/quickjs)')
    assert.equal(quickjs.status, STATUS.yellow)
    assert.match(quickjs.note, /node scripts\/update-quickjs\.mjs v0\.17\.0/)
    assert.equal(byName(rows, 'GHSA-1111').status, STATUS.red, 'high, in range')
    assert.equal(byName(rows, 'GHSA-1111').latest, 'fixed in 0.16.0')
    assert.equal(byName(rows, 'GHSA-4444'), undefined, 'out of range')
    assert.equal(
      byName(rows, 'GHSA-7777').status,
      STATUS.yellow,
      'no range, published after the pin'
    )
    assert.equal(byName(rows, 'civetweb (civetweb').status, STATUS.green)
    assert.equal(byName(rows, 'civetweb: security advisories').status, STATUS.green)
  })
})

describe('swift section', () => {
  it('flags a dependency whose latest is outside the declared range, and an old Swift image', async () => {
    const rows = await swift.run(
      ctxWith({
        'apple/swift-crypto/releases': [{ tag_name: '5.0.3' }, { tag_name: '3.15.1' }],
        'weichsel/ZIPFoundation/releases': [],
        'weichsel/ZIPFoundation/tags': [{ name: '0.9.20' }, { name: '0.9.19' }],
        'xcodereleases\\.com': fixture('xcodereleases.json'),
        'hub\\.docker\\.com': fixture('docker-swift-tags.json'),
      })
    )
    const crypto = byName(rows, 'apple/swift-crypto')
    assert.equal(crypto.status, STATUS.yellow)
    assert.match(crypto.note, /outside 2\.0\.0\.\.<4\.0\.0/)
    assert.equal(byName(rows, 'ZIPFoundation').status, STATUS.green, 'tags fallback')
    assert.equal(byName(rows, 'example/branchy').status, STATUS.unavailable)
    assert.match(byName(rows, 'Xcode').latest, /^27\.1 \(Swift 6\.4/)
    const image = byName(rows, 'swift:6.3-jammy')
    assert.equal(image.latest, '6.4.1')
    assert.match(image.note, /ships Swift 6\.4/)
    assert.equal(byName(rows, 'CocoaPods').current, 'none')
  })
})

describe('node section', () => {
  it('turns pnpm outdated/audit JSON into rows, whatever the exit code', async () => {
    const exec = (command, args) => {
      assert.equal(command, 'pnpm')
      if (args[0] === 'outdated')
        return { status: 1, stdout: `WARN something\n${fixture('pnpm-outdated.json')}`, stderr: '' }
      return { status: 1, stdout: fixture('pnpm-audit.json'), stderr: '' }
    }
    const rows = await node.run(ctxWith({}, {}, { exec }))
    assert.equal(byName(rows, 'vitest').note.startsWith('major update'), true)
    assert.match(byName(rows, 'old-thing').note, /^deprecated/)
    assert.equal(byName(rows, 'happy-dom').status, STATUS.red)
    assert.equal(byName(rows, 'esbuild').status, STATUS.yellow)
  })

  it('a broken pnpm is ⚪', async () => {
    const exec = () => ({ status: 1, stdout: '', stderr: 'ERR_PNPM_NO_LOCKFILE no lockfile' })
    const rows = await node.run(ctxWith({}, {}, { exec }))
    assert.equal(
      rows.every((r) => r.status === STATUS.unavailable),
      true
    )
    assert.match(rows[0].note, /no lockfile/)
  })
})

describe('runner + rendering', () => {
  it('a section that throws becomes one ⚪ row', async () => {
    const boom = {
      id: 'boom',
      title: 'Boom',
      run: async () => {
        throw new Error('kaput')
      },
    }
    const [result] = await runSections([boom], ctxWith({}))
    assert.equal(result.rows[0].status, STATUS.unavailable)
    assert.match(result.rows[0].note, /kaput/)
  })

  it('markdown has a summary and a "Needs action" list; json round-trips', () => {
    const sections = [
      {
        id: 'x',
        title: 'X',
        rows: [
          {
            name: 'a|b',
            current: '1',
            latest: '2',
            status: STATUS.red,
            note: 'urgent',
            source: 'https://e.x',
          },
        ],
      },
    ]
    const md = renderMarkdown(sections, { generatedAt: '2026-10-24' })
    assert.match(md, /🔴 1 · 🟡 0/)
    assert.match(md, /## Needs action/)
    assert.match(md, /\[a\\\|b\]\(https:\/\/e\.x\)/)
    assert.equal(JSON.parse(renderJson(sections, { generatedAt: 'd' })).summary.red, 1)
  })

  it('offline http fails fast; 404s are errors', async () => {
    await assert.rejects(
      createHttp({ offline: true, fetchImpl: () => assert.fail('no fetch offline') }).text(
        'https://x.y'
      ),
      /offline/
    )
    await assert.rejects(createHttp({ fetchImpl: fakeFetch({}) }).text('https://x.y/z'), /HTTP 404/)
  })

  it('parses the CLI options', () => {
    const options = parseArgs([
      '--markdown',
      '--only',
      'store,swift',
      '--accept-watch',
      'all',
      '--examples',
    ])
    assert.equal(options.format, 'markdown')
    assert.deepEqual([...options.only], ['store', 'swift'])
    assert.equal(options.acceptWatch, 'all')
    assert.equal(options.examples, true)
    assert.throws(() => parseArgs(['--nope']), /Unknown option/)
  })
})
