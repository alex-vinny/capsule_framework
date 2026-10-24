// Parsers for the SwiftPM manifest and lockfile, and the Swift image the repo builds with.

import { stripLineComments } from './gradle.mjs'

/**
 * `Package.swift` → `{ toolsVersion, platforms: { iOS, macOS }, dependencies }`.
 * Each dependency is `{ url, owner, repo, requirement }`; the requirement is one of
 * `{ kind: 'range', lower, upper }` (`"2.0.0"..<"4.0.0"`), `{ kind: 'upToNextMajor' | 'upToNextMinor' | 'from' | 'exact', lower }`,
 * or `{ kind: 'branch' | 'revision', value }`.
 */
export function parsePackageSwift(text) {
  const code = stripLineComments(text)
  const toolsVersion = /swift-tools-version\s*:\s*([0-9.]+)/.exec(text)?.[1]
  const platforms = {}
  for (const m of code.matchAll(
    /\.(iOS|macOS|tvOS|watchOS|visionOS)\(\s*(?:\.v([0-9_]+)|"([0-9.]+)")\s*\)/g
  )) {
    platforms[m[1]] = (m[2] ?? m[3]).replace(/_/g, '.')
  }

  const dependencies = []
  for (const m of code.matchAll(
    /\.package\(\s*url:\s*"([^"]+)"\s*,([^)]*(?:\([^)]*\))?[^)]*)\)/g
  )) {
    const [, url, rest] = m
    const slug = /github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?\/?$/.exec(url)
    dependencies.push({
      url,
      owner: slug?.[1],
      repo: slug?.[2],
      requirement: parseRequirement(rest),
    })
  }
  return { toolsVersion, platforms, dependencies }
}

function parseRequirement(text) {
  let m
  if ((m = /"([^"]+)"\s*\.\.<\s*"([^"]+)"/.exec(text)))
    return { kind: 'range', lower: m[1], upper: m[2] }
  if ((m = /"([^"]+)"\s*\.\.\.\s*"([^"]+)"/.exec(text)))
    return { kind: 'closedRange', lower: m[1], upper: m[2] }
  if ((m = /\.(upToNextMajor|upToNextMinor)\(\s*from:\s*"([^"]+)"/.exec(text)))
    return { kind: m[1], lower: m[2] }
  if ((m = /\bfrom:\s*"([^"]+)"/.exec(text))) return { kind: 'upToNextMajor', lower: m[1] }
  if ((m = /exact:\s*"([^"]+)"/.exec(text)) || (m = /\.exact\(\s*"([^"]+)"/.exec(text)))
    return { kind: 'exact', lower: m[1] }
  if ((m = /branch:\s*"([^"]+)"/.exec(text))) return { kind: 'branch', value: m[1] }
  if ((m = /revision:\s*"([^"]+)"/.exec(text))) return { kind: 'revision', value: m[1] }
  return { kind: 'unknown' }
}

/** Human form of a requirement, as Package.swift spells it. */
export function describeRequirement(req) {
  switch (req.kind) {
    case 'range':
      return `${req.lower}..<${req.upper}`
    case 'closedRange':
      return `${req.lower}...${req.upper}`
    case 'upToNextMajor':
    case 'upToNextMinor':
      return `${req.kind}(from: ${req.lower})`
    case 'exact':
      return `exact ${req.lower}`
    case 'branch':
    case 'revision':
      return `${req.kind} ${req.value}`
    default:
      return '?'
  }
}

/** The exclusive upper bound a requirement allows (`undefined` = no bound / not a version range). */
export function requirementUpperBound(req) {
  const parts = (req.lower ?? '').split('.').map(Number)
  switch (req.kind) {
    case 'range':
      return req.upper
    case 'upToNextMajor':
      return `${(parts[0] ?? 0) + 1}.0.0`
    case 'upToNextMinor':
      return `${parts[0] ?? 0}.${(parts[1] ?? 0) + 1}.0`
    default:
      return undefined
  }
}

/** `Package.resolved` (v2/v3) → `{ identity, url, version, revision }[]`. */
export function parsePackageResolved(json) {
  const pins = json?.pins ?? json?.object?.pins ?? []
  return pins.map((p) => ({
    identity: p.identity ?? p.package,
    url: p.location ?? p.repositoryURL,
    version: p.state?.version,
    revision: p.state?.revision,
  }))
}

/** Every `swift:X.Y[.Z]-<distro>` image named in a file (ci.yml, verify.mjs). */
export function findSwiftImages(text) {
  return [
    ...new Set(
      [...text.matchAll(/\bswift:(\d+\.\d+(?:\.\d+)?)-([a-z]+)\b/g)].map((m) => `${m[1]}-${m[2]}`)
    ),
  ]
}
