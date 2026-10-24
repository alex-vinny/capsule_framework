import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ANDROID_TOOLCHAIN } from '../platform/android-toolchain.js'
import { APP_LIBRARIES, APP_PLUGINS, generateVersionCatalog } from '../sync/sync.js'
import { DEFAULT_ANDROID_SDKS, generateConfig } from '../commands/init.js'

// platform/android-toolchain.ts is generated from the library's Gradle build so `capsule sync`
// can never drift from it. These tests are the guard: the committed module must match what the
// generator reads from packages/capsule-android today, and the app's catalog must use it.

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..')

describe('android-toolchain.ts', () => {
  it('matches the library build (re-run `pnpm gen` after a Gradle bump)', () => {
    // --check regenerates into a temp dir and exits non-zero when the committed file differs.
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/gen/index.mjs', '--only', 'android-toolchain', '--check'],
        { cwd: repoRoot, stdio: 'pipe' }
      )
    ).not.toThrow()
  })

  it('has every catalog entry the generated app references', () => {
    for (const key of APP_LIBRARIES) expect(ANDROID_TOOLCHAIN.libraries).toHaveProperty([key])
    for (const key of APP_PLUGINS) expect(ANDROID_TOOLCHAIN.plugins).toHaveProperty([key])
  })
})

describe('generated app catalog', () => {
  const catalog = generateVersionCatalog()

  it('pins the library versions', () => {
    expect(catalog).toContain(`agp = "${ANDROID_TOOLCHAIN.versions.agp}"`)
    expect(catalog).toContain(`kotlin = "${ANDROID_TOOLCHAIN.versions.kotlin}"`)
    const okhttp = ANDROID_TOOLCHAIN.libraries.okhttp
    expect(catalog).toContain(
      `okhttp = { group = "${okhttp.group}", name = "${okhttp.name}", version.ref = "${okhttp.versionRef}" }`
    )
  })

  it('declares only the versions its entries reference', () => {
    const versionKeys = catalog
      .split('[libraries]')[0]
      .split('\n')
      .filter((line) => line.includes(' = '))
      .map((line) => line.split(' = ')[0])
    const referenced = [...APP_LIBRARIES, ...APP_PLUGINS].map(
      (key) => (ANDROID_TOOLCHAIN.libraries[key] ?? ANDROID_TOOLCHAIN.plugins[key]).versionRef
    )
    expect(new Set(versionKeys)).toEqual(new Set(referenced.filter(Boolean)))
    // Test-only in the library; not referenced by the app.
    expect(catalog).not.toMatch(/^junit = /m)
  })

  it('inlines a version when the library entry has no version.ref', () => {
    const toolchain = structuredClone(ANDROID_TOOLCHAIN)
    toolchain.libraries.guava = { group: 'com.google.guava', name: 'guava', version: '1.0' }
    expect(generateVersionCatalog(toolchain)).toContain(
      'guava = { group = "com.google.guava", name = "guava", version = "1.0" }'
    )
  })

  it('names a missing entry', () => {
    const toolchain = structuredClone(ANDROID_TOOLCHAIN)
    delete toolchain.libraries.okhttp
    expect(() => generateVersionCatalog(toolchain)).toThrow(/"okhttp" is missing/)
  })
})

describe('capsule init defaults', () => {
  it('start a new app on the library SDK levels', () => {
    expect(DEFAULT_ANDROID_SDKS).toEqual({
      minSdk: ANDROID_TOOLCHAIN.minSdk,
      targetSdk: ANDROID_TOOLCHAIN.targetSdk ?? ANDROID_TOOLCHAIN.compileSdk,
      compileSdk: ANDROID_TOOLCHAIN.compileSdk,
    })
    const config = generateConfig('dev.capsule.app', 'App', 'react-ts')
    expect(config).toContain(`targetSdk:  ${DEFAULT_ANDROID_SDKS.targetSdk},`)
    expect(config).toContain(`compileSdk: ${DEFAULT_ANDROID_SDKS.compileSdk},`)
  })
})
