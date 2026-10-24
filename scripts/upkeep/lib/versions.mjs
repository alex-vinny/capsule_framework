// Version parsing and comparison for the upkeep report — loose enough for Maven, npm, Gradle,
// SwiftPM and git tags (`v1.16`, `2.0.0`, `33.3.1-android`, `1.0.0-beta2`, `9.5.0-rc01`).

const PRERELEASE =
  /(?:^|[.\-_+])(?:alpha|beta|rc|cr|m|milestone|preview|pre|dev|snapshot|eap|canary|nightly)[.\-_]?\d*(?=$|[.\-_+])/i

/** `true` for alpha/beta/rc/preview/snapshot-style versions. `-android` / `-jre` flavours are not prereleases. */
export function isPrerelease(version) {
  return PRERELEASE.test(String(version).replace(/^v/i, ''))
}

/** `v1.16` → `{ parts: [1, 16], pre: '' }`; the qualifier after the numeric run is kept for tie-breaks. */
export function parseVersion(version) {
  const text = String(version).trim().replace(/^v/i, '')
  const match = /^(\d+(?:\.\d+)*)(.*)$/.exec(text)
  if (!match) return null
  return { parts: match[1].split('.').map(Number), qualifier: match[2].replace(/^[.\-_+]/, '') }
}

/** Negative / 0 / positive like `Array.sort`; unparsable versions sort first. */
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0
  const length = Math.max(pa.parts.length, pb.parts.length)
  for (let i = 0; i < length; i++) {
    const diff = (pa.parts[i] ?? 0) - (pb.parts[i] ?? 0)
    if (diff !== 0) return diff
  }
  // Same numbers: a prerelease sorts before its release (1.0.0-beta2 < 1.0.0).
  const preA = isPrerelease(a)
  const preB = isPrerelease(b)
  if (preA !== preB) return preA ? -1 : 1
  return pa.qualifier.localeCompare(pb.qualifier, 'en', { numeric: true })
}

/**
 * The newest version in `versions`. Prereleases are skipped unless `allowPrerelease` — callers pass
 * `isPrerelease(current)` so a pin that is itself a beta (mlkit) is compared with newer betas.
 * `sameFlavour` keeps a `-android` pin on `-android` releases (guava ships `-jre` too).
 */
export function pickLatest(versions, { allowPrerelease = false, flavourOf } = {}) {
  const flavour = flavourOf ? versionFlavour(flavourOf) : undefined
  const candidates = versions.filter(
    (v) =>
      parseVersion(v) &&
      (allowPrerelease || !isPrerelease(v)) &&
      (flavour === undefined || versionFlavour(v) === flavour)
  )
  return candidates.sort(compareVersions).at(-1)
}

/**
 * A word suffix that marks a build flavour (`33.3.1-android` → `android`, `-jre` → `jre`); '' for
 * none, for prereleases, and for numeric suffixes like KSP's `2.0.0-1.0.24`.
 */
export function versionFlavour(version) {
  const parsed = parseVersion(version)
  if (!parsed || isPrerelease(version)) return ''
  return /^[a-z]+$/i.test(parsed.qualifier) ? parsed.qualifier.toLowerCase() : ''
}

/**
 * How far `current` is behind `latest`: `same`, `patch`, `minor`, `major`, `ahead`, or `unknown`.
 * A prerelease → its release of the same numbers counts as `patch`.
 */
export function classifyUpdate(current, latest) {
  if (!current || !latest) return 'unknown'
  const pc = parseVersion(current)
  const pl = parseVersion(latest)
  if (!pc || !pl) return 'unknown'
  const order = compareVersions(current, latest)
  if (order === 0) return 'same'
  if (order > 0) return 'ahead'
  if ((pl.parts[0] ?? 0) !== (pc.parts[0] ?? 0)) return 'major'
  if ((pl.parts[1] ?? 0) !== (pc.parts[1] ?? 0)) return 'minor'
  return 'patch'
}

/**
 * Whether `version` is inside a GitHub-advisory style range: comparators joined by commas, all of
 * which must hold (`< 0.16.0`, `>= 0.10.0, < 0.16.0`, `= 1.2.3`). `undefined` for an empty or
 * unparsable range — the caller then can't tell.
 */
export function satisfiesRange(version, range) {
  const parts = String(range ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return undefined
  for (const part of parts) {
    const m = /^(<=|>=|<|>|=)?\s*v?(\S+)$/.exec(part)
    if (!m || !parseVersion(m[2])) return undefined
    const order = compareVersions(version, m[2])
    const ok = {
      '<': order < 0,
      '<=': order <= 0,
      '>': order > 0,
      '>=': order >= 0,
      '=': order === 0,
    }[m[1] ?? '=']
    if (!ok) return false
  }
  return true
}
