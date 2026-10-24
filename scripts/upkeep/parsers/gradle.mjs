// Parsers for the Android build files the report reads: the version catalog (a TOML subset),
// build.gradle.kts SDK pins, and gradle-wrapper.properties. Pure — text in, data out.

/** Drops `// …` comments but keeps `://` inside URLs. */
export const stripLineComments = (text) => text.replace(/(^|[^:])\/\/.*$/gm, '$1')

/** A `"…"` string, a bare number/word, or a `{ a = "x", b.ref = "y" }` inline table. */
function parseValue(raw) {
  const text = raw.trim()
  if (text.startsWith('"')) return /^"((?:[^"\\]|\\.)*)"/.exec(text)?.[1] ?? ''
  if (text.startsWith('{')) {
    const body = text.slice(1, text.lastIndexOf('}'))
    const table = {}
    for (const m of body.matchAll(/([A-Za-z0-9_.-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,}]+)/g)) {
      table[m[1]] = parseValue(m[2])
    }
    return table
  }
  return text
}

/**
 * `gradle/libs.versions.toml` → `{ versions, libraries, plugins }`. Each library is
 * `{ alias, group, name, version, versionRef }`; each plugin `{ alias, id, version, versionRef }`.
 * Handles `module = "g:a"`, `version.ref = "x"`, `version = "1.0"` and `version = { ref = "x" }`.
 */
export function parseVersionCatalog(text) {
  const sections = { versions: {}, libraries: {}, plugins: {}, bundles: {} }
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      current = sections[header[1].trim()] ?? null
      continue
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line)
    if (current && pair) current[pair[1]] = parseValue(pair[2])
  }

  const resolve = (entry) => {
    const ref =
      entry['version.ref'] ?? (typeof entry.version === 'object' ? entry.version.ref : undefined)
    const version = ref
      ? sections.versions[ref]
      : typeof entry.version === 'string'
        ? entry.version
        : undefined
    return { version, versionRef: ref }
  }

  const libraries = Object.entries(sections.libraries).map(([alias, entry]) => {
    const spec =
      typeof entry === 'string'
        ? { module: entry.split(':').slice(0, 2).join(':'), version: entry.split(':')[2] }
        : entry
    const [group, name] = spec.module ? spec.module.split(':') : [spec.group, spec.name]
    return { alias, group, name, ...resolve(spec) }
  })
  const plugins = Object.entries(sections.plugins).map(([alias, entry]) => {
    const spec =
      typeof entry === 'string' ? { id: entry.split(':')[0], version: entry.split(':')[1] } : entry
    return { alias, id: spec.id, ...resolve(spec) }
  })
  return { versions: sections.versions, libraries, plugins }
}

/** `compileSdk = 35`, `targetSdk = 35`, `minSdk = 26`, `ndkVersion = "27.2…"` from a build.gradle.kts. */
export function parseGradleKts(text) {
  const code = stripLineComments(text)
  const int = (key) => {
    const m = new RegExp(`\\b${key}\\s*=\\s*(\\d+)`).exec(code)
    return m ? Number(m[1]) : undefined
  }
  return {
    compileSdk: int('compileSdk'),
    targetSdk: int('targetSdk'),
    minSdk: int('minSdk'),
    ndkVersion: /\bndkVersion\s*=\s*"([^"]+)"/.exec(code)?.[1],
  }
}

/** `distributionUrl=…/gradle-8.9-bin.zip` → `'8.9'`. */
export function parseWrapperProperties(text) {
  return /distributionUrl=.*gradle-([0-9][^-]*?)-(?:bin|all)\.zip/.exec(text)?.[1]
}

/**
 * SDK defaults from a TS/JS source (the CLI's generated android-toolchain.ts or init.ts):
 * the first `targetSdk: 36` / `targetSdk = 36` / `"targetSdk": 36` wins for each key.
 */
export function parseSdkDefaults(text) {
  const code = stripLineComments(text)
  const int = (key) => {
    const m = new RegExp(`["']?\\b${key}["']?\\s*[:=]\\s*(\\d+)`).exec(code)
    return m ? Number(m[1]) : undefined
  }
  return { minSdk: int('minSdk'), targetSdk: int('targetSdk'), compileSdk: int('compileSdk') }
}
