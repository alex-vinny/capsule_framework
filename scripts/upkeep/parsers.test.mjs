import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  parseGradleKts,
  parseSdkDefaults,
  parseVersionCatalog,
  parseWrapperProperties,
} from './parsers/gradle.mjs'
import { mainText, pageHash, sha256 } from './parsers/page.mjs'
import { parseAudit, parseOutdated } from './parsers/pnpm.mjs'
import {
  githubAdvisories,
  githubReleaseTags,
  latestXcodeRelease,
  parseAndroidRepository,
  parseGradleCurrent,
  parseMavenMetadata,
  swiftImageTags,
} from './parsers/sources.mjs'
import {
  describeRequirement,
  findSwiftImages,
  parsePackageResolved,
  parsePackageSwift,
  requirementUpperBound,
} from './parsers/swift.mjs'
import { parseVersionFile } from './repo.mjs'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name) => readFileSync(join(fixtures, name), 'utf8')
const json = (name) => JSON.parse(fixture(name))

describe('version catalog', () => {
  const catalog = parseVersionCatalog(fixture('libs.versions.toml'))

  it('reads [versions], skipping comments', () => {
    assert.equal(catalog.versions.agp, '8.7.0')
    assert.equal(catalog.versions['mlkit-genai-prompt'], '1.0.0-beta2')
  })

  it('resolves version.ref, inline versions, module = and the string shorthand', () => {
    const byAlias = Object.fromEntries(catalog.libraries.map((l) => [l.alias, l]))
    assert.deepEqual(byAlias.guava, {
      alias: 'guava',
      group: 'com.google.guava',
      name: 'guava',
      version: '33.3.1-android',
      versionRef: 'guava',
    })
    assert.deepEqual(byAlias.okhttp, {
      alias: 'okhttp',
      group: 'com.squareup.okhttp3',
      name: 'okhttp',
      version: '4.12.0',
      versionRef: undefined,
    })
    assert.equal(byAlias.shorthand.group, 'org.example')
    assert.equal(byAlias.shorthand.version, '1.2.3')
  })

  it('reads plugins', () => {
    const ksp = catalog.plugins.find((p) => p.alias === 'ksp')
    assert.equal(ksp.id, 'com.google.devtools.ksp')
    assert.equal(ksp.version, '2.0.0-1.0.24')
    assert.equal(catalog.plugins.find((p) => p.alias === 'android-library').version, '8.7.0')
  })
})

describe('gradle build files', () => {
  it('reads SDK pins, ignoring commented-out values but not URLs', () => {
    assert.deepEqual(parseGradleKts(fixture('build.gradle.kts')), {
      compileSdk: 35,
      targetSdk: undefined,
      minSdk: 26,
      ndkVersion: '27.2.12479018',
    })
  })

  it('reads the wrapper version', () => {
    assert.equal(parseWrapperProperties(fixture('gradle-wrapper.properties')), '8.9')
    assert.equal(
      parseWrapperProperties('distributionUrl=https\\://x/gradle-9.1.0-all.zip'),
      '9.1.0'
    )
  })

  it('reads SDK defaults from TS, skipping type declarations and null', () => {
    assert.deepEqual(parseSdkDefaults(fixture('android-toolchain.ts.fixture')), {
      minSdk: 26,
      targetSdk: undefined,
      compileSdk: 35,
    })
    assert.deepEqual(
      parseSdkDefaults('android: {\n  minSdk:     26,\n  targetSdk:  35,\n  compileSdk: 35,\n}'),
      {
        minSdk: 26,
        targetSdk: 35,
        compileSdk: 35,
      }
    )
  })
})

describe('remote sources', () => {
  it('maven-metadata.xml lists every version', () => {
    assert.deepEqual(parseMavenMetadata(fixture('maven-metadata.xml')), [
      '33.3.1-android',
      '33.3.1-jre',
      '33.4.0-android',
      '33.4.0-jre',
      '34.0.0-rc1-android',
    ])
  })

  it('repository2-3.xml keeps stable platforms and NDKs only', () => {
    const repo = parseAndroidRepository(fixture('repository2-3.xml'))
    assert.deepEqual(
      repo.platforms.map((p) => `${p.api}.${p.minor}`),
      ['35.0', '36.0', '36.1']
    )
    assert.deepEqual(repo.ndks, ['27.2.12479018', '27.3.13750724', '29.0.14206865'])
  })

  it('Gradle current', () => {
    assert.equal(parseGradleCurrent({ version: '9.8.2', current: true }), '9.8.2')
  })

  it('xcodereleases picks the newest final release, not the RC', () => {
    assert.deepEqual(latestXcodeRelease(json('xcodereleases.json')), {
      version: '27.1',
      build: '27A9275',
      swift: '6.4',
      iosSdk: '27.1',
      date: '2026-10-15',
    })
  })

  it('Docker Hub swift tags: versioned <distro> tags only', () => {
    assert.deepEqual(swiftImageTags(json('docker-swift-tags.json')), ['6.4.1', '6.4', '6.3'])
  })

  it('GitHub releases drop drafts and prereleases', () => {
    assert.deepEqual(
      githubReleaseTags([
        { tag_name: 'v2.0.0-rc1', prerelease: true },
        { tag_name: 'v1.9.0', draft: true },
        { tag_name: 'v1.8.0' },
      ]),
      ['v1.8.0']
    )
    assert.deepEqual(githubReleaseTags({ tag_name: 'v1.16' }), ['v1.16'])
  })

  it('GitHub advisories keep severity, ranges and fixed versions', () => {
    const [first] = githubAdvisories(json('github-advisories.json'))
    assert.equal(first.id, 'GHSA-1111-2222-3333')
    assert.equal(first.severity, 'high')
    assert.deepEqual(first.vulnerabilities, [{ range: '>= 0.15.1', patched: '0.16.0' }])
  })

  it('VERSION files', () => {
    assert.deepEqual(parseVersionFile('repo=https://github.com/o/r\nref=v1.16\ncommit=abc=def\n'), {
      repo: 'https://github.com/o/r',
      ref: 'v1.16',
      commit: 'abc=def',
    })
  })
})

describe('SwiftPM', () => {
  const manifest = parsePackageSwift(fixture('Package.swift'))

  it('reads tools version and platforms', () => {
    assert.equal(manifest.toolsVersion, '5.9')
    assert.deepEqual(manifest.platforms, { iOS: '13', macOS: '10.15' })
  })

  it('reads dependencies and their requirements (URLs in comments are not dependencies)', () => {
    assert.deepEqual(
      manifest.dependencies.map((d) => [
        `${d.owner}/${d.repo}`,
        describeRequirement(d.requirement),
      ]),
      [
        ['apple/swift-crypto', '2.0.0..<4.0.0'],
        ['weichsel/ZIPFoundation', 'upToNextMajor(from: 0.9.19)'],
        ['example/branchy', 'branch main'],
      ]
    )
  })

  it('computes the exclusive upper bound of a requirement', () => {
    const [crypto, zip, branchy] = manifest.dependencies.map((d) =>
      requirementUpperBound(d.requirement)
    )
    assert.equal(crypto, '4.0.0')
    assert.equal(zip, '1.0.0')
    assert.equal(branchy, undefined)
  })

  it('reads Package.resolved pins', () => {
    assert.deepEqual(
      parsePackageResolved(json('Package.resolved')).map((p) => [p.identity, p.version]),
      [
        ['swift-crypto', '3.15.1'],
        ['zipfoundation', '0.9.20'],
      ]
    )
  })

  it('finds swift images in CI files', () => {
    assert.deepEqual(
      findSwiftImages(
        'container: swift:6.3-jammy\n# swift:6.3-jammy again\nimage: swift:6.4.1-noble'
      ),
      ['6.3-jammy', '6.4.1-noble']
    )
  })
})

describe('pnpm JSON', () => {
  it('outdated: one entry per package with its dependents', () => {
    const entries = parseOutdated(json('pnpm-outdated.json'))
    assert.equal(entries.length, 3)
    assert.deepEqual(entries[0], {
      name: 'vitest',
      current: '2.1.9',
      wanted: '2.1.9',
      latest: '4.1.9',
      dependencyType: 'devDependencies',
      deprecated: false,
      dependents: ['@capsule/core'],
    })
    assert.equal(entries[2].deprecated, true)
    assert.deepEqual(parseOutdated({}), [])
  })

  it('audit: advisories worst first', () => {
    const advisories = parseAudit(json('pnpm-audit.json'))
    assert.deepEqual(
      advisories.map((a) => [a.module, a.severity]),
      [
        ['happy-dom', 'critical'],
        ['esbuild', 'moderate'],
      ]
    )
    assert.deepEqual(advisories[0].paths, ['packages/core > happy-dom'])
    assert.deepEqual(parseAudit({ advisories: {} }), [])
  })
})

describe('store page text + hash', () => {
  const html = fixture('page.html')

  it('keeps only the main content, entities decoded, whitespace collapsed', () => {
    assert.equal(
      mainText(html),
      'Upcoming requirements Starting April 28, 2026, apps must be built with Xcode 26 & the iOS 26 SDK.'
    )
  })

  it('ignores scripts, styles, nav, comments and markup changes', () => {
    const noisy = html
      .replace('abc123', 'zzz999')
      .replace('build 42', 'build 43')
      .replace('<b>', '<strong>')
      .replace('</b>', '</strong>')
      .replace('Menu item', 'Other')
    assert.equal(pageHash(noisy), pageHash(html))
  })

  it('changes when the words change', () => {
    assert.notEqual(pageHash(html.replace('Xcode&#160;26', 'Xcode&#160;27')), pageHash(html))
    assert.equal(pageHash(html), sha256(mainText(html)))
    assert.match(pageHash(html), /^[0-9a-f]{64}$/)
  })
})
