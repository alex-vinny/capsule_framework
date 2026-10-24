// Generates packages/cli/src/platform/android-toolchain.ts from the Capsule library's own Android
// build, so the project `capsule sync` emits for an app can never drift from the toolchain the
// library is built and tested with (docs/contributing/upkeep.md — "sources of version truth").
//
// Reads (all under packages/capsule-android/):
//   gradle/libs.versions.toml              → versions, libraries, plugins
//   gradle/wrapper/gradle-wrapper.properties → Gradle version
//   capsule/build.gradle.kts               → compileSdk, targetSdk (if declared), minSdk, ndkVersion
//
// Plain Node, no build step — run through scripts/gen/index.mjs (`--only android-toolchain`).

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './lib.mjs'

export const androidDir = join(root, 'packages', 'capsule-android')

/** Where the module is committed (the generator's output base). */
export const toolchainOutDir = join(root, 'packages', 'cli', 'src', 'platform')
export const toolchainFile = 'android-toolchain.ts'

const read = (...path) => readFileSync(join(androidDir, ...path), 'utf8')

/** `key = "value"` pairs inside an inline table such as `{ group = "a", version.ref = "b" }`. */
function inlineTable(text) {
  const fields = {}
  for (const match of text.matchAll(/([\w.-]+)\s*=\s*"([^"]*)"/g)) fields[match[1]] = match[2]
  return fields
}

/**
 * Parses the subset of TOML a Gradle version catalog uses: [versions] string entries plus
 * [libraries] / [plugins] inline tables (`group`+`name` or `module`, `version` or `version.ref`).
 */
export function parseVersionCatalog(text) {
  const sections = { versions: {}, libraries: {}, plugins: {} }
  let section
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/\s+#.*$/, '')
      .replace(/^#.*$/, '')
      .trim()
    if (!line) continue
    const header = /^\[([\w-]+)\]$/.exec(line)
    if (header) {
      section = header[1]
      continue
    }
    const entry = /^([\w-]+)\s*=\s*(.+)$/.exec(line)
    if (!entry || !(section in sections)) continue
    const [, key, value] = entry
    sections[section][key] = value.startsWith('{') ? inlineTable(value) : JSON.parse(value)
  }

  const resolve = (fields, key) => {
    const ref = fields['version.ref']
    const version = ref !== undefined ? sections.versions[ref] : fields.version
    if (version === undefined)
      throw new Error(`libs.versions.toml: "${key}" has no resolvable version`)
    return ref !== undefined ? { version, versionRef: ref } : { version }
  }

  const libraries = {}
  for (const [key, fields] of Object.entries(sections.libraries)) {
    const [group, name] = fields.module ? fields.module.split(':') : [fields.group, fields.name]
    libraries[key] = { group, name, ...resolve(fields, key) }
  }
  const plugins = {}
  for (const [key, fields] of Object.entries(sections.plugins)) {
    plugins[key] = { id: fields.id, ...resolve(fields, key) }
  }
  return { versions: sections.versions, libraries, plugins }
}

/** The toolchain the library build declares (every value the generated app must match). */
export function readAndroidToolchain() {
  const wrapper = read('gradle', 'wrapper', 'gradle-wrapper.properties')
  const gradle = /gradle-([\w.-]+?)-(?:bin|all)\.zip/.exec(wrapper)?.[1]
  if (!gradle) throw new Error('gradle-wrapper.properties: no distributionUrl version')

  const build = read('capsule', 'build.gradle.kts')
  const int = (name) => {
    const value = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(build)?.[1]
    return value === undefined ? null : Number(value)
  }
  const compileSdk = int('compileSdk')
  const minSdk = int('minSdk')
  const ndk = /\bndkVersion\s*=\s*"([^"]+)"/.exec(build)?.[1]
  if (compileSdk === null || minSdk === null || !ndk) {
    throw new Error('capsule/build.gradle.kts: compileSdk, minSdk and ndkVersion must all be set')
  }

  return {
    gradle,
    compileSdk,
    targetSdk: int('targetSdk'),
    minSdk,
    ndk,
    ...parseVersionCatalog(read('gradle', 'libs.versions.toml')),
  }
}

/**
 * Renders a value as a TypeScript literal already in the repo's Prettier style (single quotes, no
 * needless key quotes, trailing commas, one property per line), so `pnpm format` never rewrites
 * the generated file and `--check` stays a pure drift gate.
 */
function toTs(value, indent = '') {
  if (value === null || typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const entries = Object.entries(value)
  if (entries.length === 0) return '{}'
  const inner = indent + '  '
  const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : toTs(name))
  return `{\n${entries.map(([k, v]) => `${inner}${key(k)}: ${toTs(v, inner)},\n`).join('')}${indent}}`
}

export function renderAndroidToolchain(toolchain = readAndroidToolchain()) {
  return `// Generated from packages/capsule-android (gradle/libs.versions.toml, gradle-wrapper.properties,
// capsule/build.gradle.kts) by \`node scripts/gen/index.mjs --only android-toolchain\` — do not edit.
// Bump versions in the library's build; \`capsule sync\` and \`capsule init\` read them from here.

export interface CatalogLibrary {
  group: string
  name: string
  version: string
  /** The [versions] key the library catalog references, when it uses \`version.ref\`. */
  versionRef?: string
}

export interface CatalogPlugin {
  id: string
  version: string
  versionRef?: string
}

export interface AndroidToolchain {
  gradle: string
  compileSdk: number
  /** The library's own targetSdk, when its build declares one; null means "use compileSdk". */
  targetSdk: number | null
  minSdk: number
  ndk: string
  versions: Record<string, string>
  libraries: Record<string, CatalogLibrary>
  plugins: Record<string, CatalogPlugin>
}

export const ANDROID_TOOLCHAIN: AndroidToolchain = ${toTs(toolchain)}
`
}

/** Writes the module into `outDir` (the committed location, or a temp dir in --check mode). */
export function generateAndroidToolchain(outDir = toolchainOutDir) {
  writeFileSync(join(outDir, toolchainFile), renderAndroidToolchain())
}
