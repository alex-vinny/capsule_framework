// Where the report finds each pin in the repo, and readers that return parsed values.
// Paths are relative to the repo root; nothing here touches the network.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseGradleKts,
  parseSdkDefaults,
  parseVersionCatalog,
  parseWrapperProperties,
} from './parsers/gradle.mjs'
import { parsePackageResolved, parsePackageSwift } from './parsers/swift.mjs'

export const PATHS = {
  catalog: 'packages/capsule-android/gradle/libs.versions.toml',
  libraryBuild: 'packages/capsule-android/capsule/build.gradle.kts',
  wrapper: 'packages/capsule-android/gradle/wrapper/gradle-wrapper.properties',
  cliToolchain: 'packages/cli/src/platform/android-toolchain.ts',
  cliInit: 'packages/cli/src/commands/init.ts',
  requirements: 'packages/cli/src/platform/requirements.json',
  requirementsDist: 'packages/cli/dist/platform/requirements.js',
  requirementsSrc: 'packages/cli/src/platform/requirements.ts',
  packageSwift: 'Package.swift',
  packageResolved: 'Package.resolved',
  native: 'packages/native',
  ci: '.github/workflows/ci.yml',
  verify: 'scripts/verify.mjs',
  examples: 'examples',
}

export function createRepo(root) {
  const path = (rel) => join(root, rel)
  const exists = (rel) => existsSync(path(rel))
  const read = (rel) => readFileSync(path(rel), 'utf8')
  return {
    root,
    path,
    exists,
    read,
    catalog: () => parseVersionCatalog(read(PATHS.catalog)),
    libraryBuild: () => parseGradleKts(read(PATHS.libraryBuild)),
    gradleWrapper: () => parseWrapperProperties(read(PATHS.wrapper)),
    /**
     * The SDK defaults `capsule init` writes: the generated toolchain module when present, else
     * init.ts. A `targetSdk: null` there means "target the compileSdk" (init.ts does the same).
     */
    cliSdkDefaults: () => {
      const file = exists(PATHS.cliToolchain) ? PATHS.cliToolchain : PATHS.cliInit
      const sdks = parseSdkDefaults(read(file))
      return { file, ...sdks, targetSdk: sdks.targetSdk ?? sdks.compileSdk }
    },
    packageSwift: () => parsePackageSwift(read(PATHS.packageSwift)),
    packageResolved: () =>
      exists(PATHS.packageResolved)
        ? parsePackageResolved(JSON.parse(read(PATHS.packageResolved)))
        : [],
  }
}

/** `KEY=value` lines of a vendored folder's VERSION file. */
export function parseVersionFile(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      })
  )
}
